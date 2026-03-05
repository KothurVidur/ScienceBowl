#!/usr/bin/env python3
"""
Python PDF upload pipeline using Hugging Face Router API inference.

Strategy:
- Read each PDF as a single full text input
- Send one prompt per PDF to HF Router chat completions API
- Parse outputs into Mongo schema question objects
- If output is invalid JSON, log a terminal error and keep raw output for manual review
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests

try:
    from pypdf import PdfReader  # type: ignore
except Exception:  # pragma: no cover
    try:
        from PyPDF2 import PdfReader  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Missing PDF reader dependency. Install one of: pypdf, PyPDF2"
        ) from exc

SCRIPT_DIR = Path(__file__).resolve().parent
QUESTIONS_DIR = SCRIPT_DIR.parent
CONFIG_PATH = QUESTIONS_DIR / "configuration.json"
RAW_OUTPUT_PATH = QUESTIONS_DIR / "raw.json"
PROMPT_TEMPLATE_PATH = SCRIPT_DIR / "prompt_template.txt"
ENV_PATH = QUESTIONS_DIR.parent.parent / ".env"  # backend/.env
HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions"

QUESTION_CATEGORIES = {
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Earth and Space",
    "Energy",
    "Other",
}

CATEGORY_ALIASES = {
    "mathematics": "Mathematics",
    "math": "Mathematics",
    "physics": "Physics",
    "chemistry": "Chemistry",
    "biology": "Biology",
    "earth and space": "Earth and Space",
    "earth&space": "Earth and Space",
    "e&s": "Earth and Space",
    "earthscience": "Earth and Space",
    "energy": "Energy",
    "other": "Other",
    "misc": "Other",
    "miscellaneous": "Other",
    "unknown": "Other",
    "m": "Mathematics",
    "p": "Physics",
    "c": "Chemistry",
    "b": "Biology",
    "s": "Earth and Space",
    "e": "Energy",
    "o": "Other",
}

DEFAULT_CATEGORY_MAP = {
    "math": "Mathematics",
    "mathematics": "Mathematics",
    "physics": "Physics",
    "chemistry": "Chemistry",
    "biology": "Biology",
    "earth and space": "Earth and Space",
    "earth & space": "Earth and Space",
    "e&s": "Earth and Space",
    "y-risk": "Other",
    "yrisk": "Other",
    "energy": "Energy",
    "estimation": "Other",
    "est": "Other",
    "other": "Other",
    "misc": "Other",
    "miscellaneous": "Other",
    "unknown": "Other",
    "astronomy": "Earth and Space",
    "computer science": "Other",
    "computerscience": "Other",
}


class PipelineError(Exception):
    pass


def normalize_whitespace(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\u00A0", " ")).strip()


def normalize_type(value: Any) -> str:
    text = normalize_whitespace(value).upper()
    if text in {"TOSSUP", "TOSS-UP", "T"}:
        return "TOSSUP"
    if text in {"BONUS", "B"}:
        return "BONUS"
    raise ValueError(f"Invalid question type: {value}")


def normalize_format(value: Any) -> str:
    text = normalize_whitespace(value).lower().replace("-", " ")
    if text in {"short answer", "shortanswer", "sa"}:
        return "Short Answer"
    if text in {"multiple choice", "multiplechoice", "mc"}:
        return "Multiple Choice"
    raise ValueError(f"Invalid question format: {value}")


def normalize_category(value: Any) -> str:
    text = normalize_whitespace(value)
    if text in QUESTION_CATEGORIES:
        return text

    key = text.lower().replace("_", " ").replace("-", " ")
    key = normalize_whitespace(key)
    key_compact = key.replace(" ", "")
    mapped = CATEGORY_ALIASES.get(key) or CATEGORY_ALIASES.get(key_compact)
    if not mapped:
        raise ValueError(f"Invalid question category: {value}")
    return mapped


def dedupe_case_insensitive(values: Sequence[Any]) -> List[str]:
    seen = set()
    output: List[str] = []
    for value in values:
        normalized = normalize_whitespace(value)
        key = normalized.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(normalized)
    return output


def natural_sort_key(value: str) -> List[Any]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def parse_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}

    env: Dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            env[key] = value
    return env


def parse_round_number(
    file_name: str,
    index: int,
    round_number_regex: Optional[re.Pattern[str]],
    use_round_number_from_file_name: bool,
) -> int:
    if not use_round_number_from_file_name:
        return index + 1

    if round_number_regex:
        match = round_number_regex.search(file_name)
        if match and match.group(1):
            return int(match.group(1))

    trailing = re.search(r"(\d+)(?!.*\d)", file_name)
    if trailing and trailing.group(1):
        return int(trailing.group(1))

    return index + 1


def round_difficulty(round_number: int, total_rounds: int) -> float:
    safe_total = max(1, int(total_rounds or 1))
    bounded_round = min(max(1, int(round_number or 1)), safe_total)
    return round(bounded_round / safe_total, 2)


def to_choice_object(raw_choices: Optional[Dict[str, Any]]) -> Dict[str, str]:
    choices = raw_choices or {}
    return {
        "W": normalize_whitespace(choices.get("W")),
        "X": normalize_whitespace(choices.get("X")),
        "Y": normalize_whitespace(choices.get("Y")),
        "Z": normalize_whitespace(choices.get("Z")),
    }


def compact_choices_to_object(raw_choices: Any) -> Dict[str, str]:
    if not isinstance(raw_choices, list):
        return to_choice_object(None)

    values = [normalize_whitespace(value) for value in raw_choices]
    return {
        "W": values[0] if len(values) > 0 else "",
        "X": values[1] if len(values) > 1 else "",
        "Y": values[2] if len(values) > 2 else "",
        "Z": values[3] if len(values) > 3 else "",
    }


def first_present(item: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in item:
            return item.get(key)
    return None


def schema_ordered_question(
    source: Dict[str, str],
    q_type: str,
    q_format: str,
    category: str,
    difficulty: float,
    question_text: str,
    choices: Dict[str, str],
    answer: Dict[str, Any],
    tags: List[str],
) -> Dict[str, Any]:
    question: Dict[str, Any] = {
        "source": source,
        "type": q_type,
        "format": q_format,
        "category": category,
        "difficulty": difficulty,
        "questionText": question_text,
    }

    if q_format == "Multiple Choice":
        question["choices"] = choices

    question["answer"] = answer
    question["explanation"] = ""
    question["tags"] = tags
    question["relatedTossup"] = None
    question["isActive"] = True
    return question


def extract_json_payload(raw_text: str) -> Any:
    text = str(raw_text or "").strip()
    if not text:
        raise PipelineError("Model returned empty text.")

    try:
        return json.loads(text)
    except Exception:
        pass

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fenced and fenced.group(1):
        return json.loads(fenced.group(1).strip())

    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])

    raise PipelineError("Unable to parse JSON payload from model response.")


def normalize_model_payload(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("questions"), list):
        return payload["questions"]
    raise PipelineError('Model JSON must be an array or an object containing a "questions" array.')


def read_pdf_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    pages: List[str] = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages).strip()


def split_text_into_cycles(text: str) -> List[str]:
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    tossup_re = re.compile(r"(?im)^\s*TOSS[\s-]?UP\s*$")
    starts = [m.start() for m in tossup_re.finditer(cleaned)]

    if not starts:
        return [cleaned.strip()] if cleaned.strip() else []

    chunks: List[str] = []
    for idx, start in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(cleaned)
        chunk = cleaned[start:end].strip()
        if chunk:
            chunks.append(chunk)

    return chunks


def get_ordered_pdf_files(pdf_folder_path: Path, pdf_file_order: Optional[List[str]]) -> List[str]:
    discovered = sorted(
        [p.name for p in pdf_folder_path.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"],
        key=natural_sort_key,
    )

    if not discovered:
        raise PipelineError(f"No PDF files found in: {pdf_folder_path}")

    if not pdf_file_order:
        return discovered

    discovered_set = set(discovered)
    ordered_set = set()
    unknown: List[str] = []
    dupes: List[str] = []

    for name in pdf_file_order:
        if name not in discovered_set:
            unknown.append(name)
        if name in ordered_set:
            dupes.append(name)
        ordered_set.add(name)

    if unknown:
        raise PipelineError(
            f"configuration.pdfFileOrder includes unknown files: {', '.join(unknown)}"
        )
    if dupes:
        raise PipelineError(f"configuration.pdfFileOrder has duplicates: {', '.join(dupes)}")

    missing = [name for name in discovered if name not in ordered_set]
    if missing:
        raise PipelineError(
            f"configuration.pdfFileOrder is missing files: {', '.join(missing)}"
        )

    return list(pdf_file_order)


def load_prompt_template(path: Path) -> str:
    if not path.exists():
        raise PipelineError(f"Prompt template file not found: {path}")
    template = path.read_text(encoding="utf-8")
    if "${text}" not in template:
        raise PipelineError(f'Prompt template is missing "${{text}}" placeholder: {path}')
    return template


def build_prompt(template: str, text: str) -> str:
    return template.replace("${text}", str(text))


def generate_json_text(
    api_url: str,
    api_key: str,
    model_id: str,
    built_prompt: str,
    temperature: float,
    max_new_tokens: int,
    timeout_seconds: int = 300,
    max_retries: int = 3,
) -> str:
    if not api_key:
        raise PipelineError("Missing HF API key (set HF_API_KEY/HF_TOKEN or configuration.aiApiKey).")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload: Dict[str, Any] = {
        "model": model_id,
        "messages": [{"role": "user", "content": built_prompt}],
        "max_tokens": int(max_new_tokens),
    }
    if temperature > 0:
        payload["temperature"] = float(temperature)

    last_error = ""
    for attempt in range(1, max_retries + 1):
        try:
            response = requests.post(
                api_url,
                headers=headers,
                json=payload,
                timeout=timeout_seconds,
            )
        except requests.RequestException as exc:
            last_error = f"request exception: {exc}"
            if attempt < max_retries:
                time.sleep(min(2 ** attempt, 8))
                continue
            raise PipelineError(f"HF Router API request failed: {last_error}") from exc

        if response.status_code in {429, 500, 502, 503, 504} and attempt < max_retries:
            last_error = f"{response.status_code}: {response.text[:280]}"
            time.sleep(min(2 ** attempt, 8))
            continue

        if response.status_code >= 400:
            raise PipelineError(
                f"HF Router API request failed ({response.status_code}): {response.text[:500]}"
            )

        try:
            response_json = response.json()
        except Exception as exc:
            raise PipelineError(
                f"HF Router API returned non-JSON response: {response.text[:500]}"
            ) from exc

        choices = response_json.get("choices")
        if not isinstance(choices, list) or not choices:
            raise PipelineError("HF Router API returned no choices.")

        message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
        text = str(message.get("content", "")).strip()
        if not text:
            raise PipelineError("HF Router API returned empty message content.")
        return text

    raise PipelineError(f"HF Router API request failed after retries: {last_error}")


def load_config() -> Dict[str, Any]:
    env_from_file = parse_env_file(ENV_PATH)

    raw = CONFIG_PATH.read_text(encoding="utf-8")
    config = json.loads(raw)

    required = ["tournamentName", "pdfFolderPath", "numberOfRounds"]
    for key in required:
        if not config.get(key):
            raise PipelineError(f'configuration.json is missing required field "{key}".')

    config_dir = CONFIG_PATH.parent
    pdf_folder_path = (config_dir / str(config["pdfFolderPath"])).resolve()
    output_directory = (
        (config_dir / str(config.get("outputDirectory"))).resolve()
        if config.get("outputDirectory")
        else pdf_folder_path.parent
    )

    round_number_regex = (
        re.compile(str(config["roundNumberRegex"])) if config.get("roundNumberRegex") else None
    )

    merged_category_map = {**DEFAULT_CATEGORY_MAP, **(config.get("categoryMap") or {})}
    category_map = {
        normalize_whitespace(k).lower(): normalize_whitespace(v)
        for k, v in merged_category_map.items()
    }

    fallback_category_raw = config.get("fallbackCategory") or "Other"
    fallback_category = normalize_category(fallback_category_raw)

    default_tags = [
        normalize_whitespace(tag)
        for tag in (config.get("defaultTags") or [])
        if normalize_whitespace(tag)
    ]

    pdf_file_order = [
        normalize_whitespace(name)
        for name in (config.get("pdfFileOrder") or [])
        if normalize_whitespace(name)
    ]

    hf_api_key = normalize_whitespace(
        config.get("huggingFaceApiKey")
        or config.get("aiApiKey")
        or os.environ.get("HF_API_KEY")
        or os.environ.get("HUGGINGFACE_API_KEY")
        or os.environ.get("HF_TOKEN")
        or env_from_file.get("HF_API_KEY")
        or env_from_file.get("HUGGINGFACE_API_KEY")
        or env_from_file.get("HF_TOKEN")
    )

    return {
        "tournamentName": normalize_whitespace(config["tournamentName"]),
        "pdfFolderPath": pdf_folder_path,
        "outputDirectory": output_directory,
        "numberOfRounds": int(config["numberOfRounds"]),
        "strictRoundCount": bool(config.get("strictRoundCount", True)),
        "useRoundNumberFromFileName": bool(config.get("useRoundNumberFromFileName", False)),
        "roundNumberRegex": round_number_regex,
        "categoryMap": category_map,
        "fallbackCategory": fallback_category,
        "defaultTags": default_tags,
        "pdfFileOrder": pdf_file_order or None,
        "ai": {
            "apiUrl": normalize_whitespace(config.get("aiApiUrl") or HF_ROUTER_URL),
            "model": normalize_whitespace(
                config.get("aiModel")
                or os.environ.get("HF_MODEL")
                or env_from_file.get("HF_MODEL")
                or "Qwen/Qwen2.5-3B-Instruct"
            ),
            "temperature": float(config.get("aiTemperature", 0.1)),
            "maxInputTokens": int(config.get("aiMaxInputTokens", 15000)),
            "maxNewTokens": int(config.get("aiMaxNewTokens", 2048)),
            "apiKey": hf_api_key,
        },
    }


def resolve_category(
    raw_category: Any,
    category_map: Dict[str, str],
    fallback_category: str,
    warnings: List[str],
    context_label: str,
) -> str:
    normalized_raw = normalize_whitespace(raw_category)
    mapped = category_map.get(normalized_raw.lower(), normalized_raw)
    try:
        return normalize_category(mapped)
    except Exception:
        warnings.append(
            f'{context_label}: invalid category "{normalized_raw}" mapped to "{fallback_category}".'
        )
        return fallback_category


def normalize_type_or_fallback(raw_type: Any, warnings: List[str], context_label: str) -> str:
    fallback = "TOSSUP"
    try:
        return normalize_type(raw_type or fallback)
    except Exception:
        warnings.append(f'{context_label}: invalid type "{raw_type}", defaulted to {fallback}.')
        return fallback


def normalize_format_or_fallback(raw_format: Any, warnings: List[str], context_label: str) -> str:
    fallback = "Short Answer"
    try:
        return normalize_format(raw_format or fallback)
    except Exception:
        warnings.append(f'{context_label}: invalid format "{raw_format}", defaulted to {fallback}.')
        return fallback


def normalize_ai_questions_for_round(
    ai_questions: List[Dict[str, Any]],
    file_name: str,
    round_number: int,
    total_rounds: int,
    packet_name: str,
    category_map: Dict[str, str],
    fallback_category: str,
    default_tags: List[str],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    warnings: List[str] = []
    output: List[Dict[str, Any]] = []
    difficulty = round_difficulty(round_number, total_rounds)

    for index, item in enumerate(ai_questions):
        if not isinstance(item, dict):
            warnings.append(f"{file_name} #{index + 1}: AI item is not an object; skipped.")
            continue

        inferred_number = None
        try:
            inferred_number = int(first_present(item, "n", "questionNumber"))
        except Exception:
            inferred_number = None

        question_number = inferred_number if inferred_number is not None else (index + 1)
        context_label = f"{file_name} #{index + 1}"

        if inferred_number is None:
            warnings.append(
                f"{context_label}: missing/invalid questionNumber, defaulted to {question_number}."
            )

        q_type = normalize_type_or_fallback(first_present(item, "t", "type"), warnings, context_label)
        q_format = normalize_format_or_fallback(first_present(item, "f", "format"), warnings, context_label)
        category = resolve_category(
            raw_category=first_present(item, "c", "category"),
            category_map=category_map,
            fallback_category=fallback_category,
            warnings=warnings,
            context_label=context_label,
        )

        question_text = normalize_whitespace(first_present(item, "q", "questionText"))
        answer_payload = first_present(item, "a", "answer")
        answer_obj = answer_payload if isinstance(answer_payload, dict) else {}
        raw_alternates = first_present(answer_obj, "a", "alternates")
        answer = {
            "canonical": normalize_whitespace(first_present(answer_obj, "c", "canonical")),
            "alternates": dedupe_case_insensitive(raw_alternates if isinstance(raw_alternates, list) else []),
        }
        compact_choices = item.get("cs")
        choices = (
            compact_choices_to_object(compact_choices)
            if isinstance(compact_choices, list)
            else to_choice_object(item.get("choices"))
        )
        manual_flag = bool(first_present(item, "m", "manual"))

        if not question_text:
            warnings.append(f"{context_label}: empty questionText.")
        if not answer["canonical"]:
            warnings.append(f"{context_label}: empty canonical answer.")
        if q_format == "Multiple Choice":
            for letter in ["W", "X", "Y", "Z"]:
                if not choices.get(letter):
                    warnings.append(f"{context_label}: missing choice {letter}.")

        tags = list(default_tags)
        if manual_flag and "manual-review" not in {t.lower() for t in tags}:
            tags.append("manual-review")

        output.append(
            schema_ordered_question(
                source={
                    "packet": packet_name,
                    "round": f"{round_number}/{total_rounds}",
                    "question": str(question_number),
                },
                q_type=q_type,
                q_format=q_format,
                category=category,
                difficulty=difficulty,
                question_text=question_text,
                choices=choices,
                answer=answer,
                tags=tags,
            )
        )

    return output, warnings


def run() -> None:
    config = load_config()
    prompt_template = load_prompt_template(PROMPT_TEMPLATE_PATH)

    pdf_files = get_ordered_pdf_files(config["pdfFolderPath"], config["pdfFileOrder"])

    if config["strictRoundCount"] and len(pdf_files) != config["numberOfRounds"]:
        raise PipelineError(
            "Round count mismatch: "
            f"found {len(pdf_files)} PDF files but configuration.numberOfRounds is {config['numberOfRounds']}."
        )

    print(f"Using HF Router API model: {config['ai']['model']}")

    all_warnings: List[str] = []
    raw_ai_outputs: List[Dict[str, Any]] = []

    for file_index, file_name in enumerate(pdf_files):
        file_path = config["pdfFolderPath"] / file_name
        round_number = parse_round_number(
            file_name=file_name,
            index=file_index,
            round_number_regex=config["roundNumberRegex"],
            use_round_number_from_file_name=config["useRoundNumberFromFileName"],
        )

        text = read_pdf_text(file_path)
        if not text:
            all_warnings.append(f"{file_name}: extracted empty text.")
            continue

        try:
            built_prompt = build_prompt(prompt_template, text)
            raw_output = generate_json_text(
                api_url=config["ai"]["apiUrl"],
                api_key=config["ai"]["apiKey"],
                model_id=config["ai"]["model"],
                built_prompt=built_prompt,
                temperature=float(config["ai"]["temperature"]),
                max_new_tokens=int(config["ai"]["maxNewTokens"]),
            )
            raw_entry: Dict[str, Any] = {
                "file": file_name,
                "round": round_number,
                "rawOutput": raw_output,
            }
            raw_ai_outputs.append(raw_entry)
            print(f"Saved raw AI output for {file_name}.")
        except Exception as api_error:
            err_msg = f"{file_name}: AI request failed: {api_error}"
            all_warnings.append(err_msg)
            print(f"[AI ERROR] {err_msg}")

    raw_payload: Dict[str, Any] = {
        "tournamentName": config["tournamentName"],
        "model": config["ai"]["model"],
        "rawOutputs": raw_ai_outputs,
        "warnings": all_warnings,
    }

    RAW_OUTPUT_PATH.write_text(json.dumps(raw_payload, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {len(raw_ai_outputs)} raw AI outputs to {RAW_OUTPUT_PATH}")
    if all_warnings:
        print(f"Warnings: {len(all_warnings)}")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        print(f"AI pipeline failed: {error}", file=sys.stderr)
        sys.exit(1)
