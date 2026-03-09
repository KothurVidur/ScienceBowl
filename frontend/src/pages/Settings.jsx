import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { userAPI, authAPI } from '../services/api';
import { FiUser, FiLock, FiSave } from 'react-icons/fi';
import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import toast from 'react-hot-toast';
import styles from './Settings.module.css';
const Settings = () => {
  const {
    user,
    updateUser
  } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState({
    displayName: user?.displayName || '',
    bio: user?.bio || ''
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const handleProfileSubmit = async e => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      const response = await userAPI.updateProfile(profileData);
      updateUser(response.data.data.user);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };
  const handlePasswordSubmit = async e => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setPasswordLoading(true);
    try {
      await authAPI.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      toast.success('Password changed successfully');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };
  const tabs = [{
    id: 'profile',
    label: 'Profile',
    icon: <FiUser />
  }, {
    id: 'security',
    label: 'Security',
    icon: <FiLock />
  }];
  return <div className={styles.settings}>
      <h1>Settings</h1>

      <div className={styles.layout}>
        {}
        <nav className={styles.tabs}>
          {tabs.map(tab => <button key={tab.id} className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`} onClick={() => setActiveTab(tab.id)}>

              {tab.icon}
              {tab.label}
            </button>)}
        </nav>

        {}
        <div className={styles.content}>
          {}
          {activeTab === 'profile' && <Card>
              <h2>Profile Settings</h2>
              <form onSubmit={handleProfileSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                  <label>Username</label>
                  <Input value={user?.username || ''} disabled />

                  <span className={styles.hint}>Username cannot be changed</span>
                </div>

                <div className={styles.formGroup}>
                  <label>Display Name</label>
                  <Input value={profileData.displayName} onChange={e => setProfileData({
                ...profileData,
                displayName: e.target.value
              })} placeholder="Your display name" maxLength={50} />

                </div>

                <div className={styles.formGroup}>
                  <label>Bio</label>
                  <textarea className={styles.textarea} value={profileData.bio} onChange={e => setProfileData({
                ...profileData,
                bio: e.target.value
              })} placeholder="Tell us about yourself..." rows={4} maxLength={500} />

                  <span className={styles.hint}>{profileData.bio.length}/500 characters</span>
                </div>

                <Button type="submit" variant="primary" loading={profileLoading} icon={<FiSave />}>

                  Save Changes
                </Button>
              </form>
            </Card>}

          {}
          {activeTab === 'security' && <Card>
              <h2>Change Password</h2>
              <form onSubmit={handlePasswordSubmit} className={styles.form}>
                <Input label="Current Password" type="password" value={passwordData.currentPassword} onChange={e => setPasswordData({
              ...passwordData,
              currentPassword: e.target.value
            })} placeholder="Enter current password" icon={<FiLock />} />

                <Input label="New Password" type="password" value={passwordData.newPassword} onChange={e => setPasswordData({
              ...passwordData,
              newPassword: e.target.value
            })} placeholder="Enter new password" icon={<FiLock />} />

                <Input label="Confirm New Password" type="password" value={passwordData.confirmPassword} onChange={e => setPasswordData({
              ...passwordData,
              confirmPassword: e.target.value
            })} placeholder="Confirm new password" icon={<FiLock />} />

                <Button type="submit" variant="primary" loading={passwordLoading} icon={<FiSave />}>

                  Change Password
                </Button>
              </form>
            </Card>}

        </div>
      </div>
    </div>;
};
export default Settings;
