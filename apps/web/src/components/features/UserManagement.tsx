import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, Plus, Edit2, Trash2, Key, Shield, UserCheck, UserX,
  RefreshCw, AlertCircle, CheckCircle, Clock, Activity
} from 'lucide-react';
import { Card, Button, Input, Select } from '../ui';
import { 
  getUsers, createUser, updateUser, resetUserPassword, deleteUser, getAuditLog,
  type AuthUser, type AuditLogEntry
} from '../../services/auth';

interface UserManagementProps {
  currentUser: { id: number; username: string; role: string } | null;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);
  
  // Form states
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('viewer');
  const [formIsActive, setFormIsActive] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuditLog = useCallback(async () => {
    try {
      const data = await getAuditLog(100);
      setAuditLogs(data.logs);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadAuditLog();
  }, [loadUsers, loadAuditLog]);

  const showSuccessMessage = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleCreateUser = async () => {
    if (!formUsername.trim() || !formPassword) {
      setError('Username and password are required');
      return;
    }
    if (formPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      await createUser(formUsername.trim(), formPassword, formRole);
      showSuccessMessage(`User "${formUsername}" created successfully`);
      setShowCreateModal(false);
      resetForm();
      loadUsers();
      loadAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    setError(null);
    try {
      await updateUser(selectedUser.id, {
        username: formUsername.trim(),
        role: formRole as 'admin' | 'manager' | 'viewer',
        is_active: formIsActive,
      });
      showSuccessMessage(`User "${formUsername}" updated successfully`);
      setShowEditModal(false);
      resetForm();
      loadUsers();
      loadAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !formPassword) return;
    
    if (formPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      await resetUserPassword(selectedUser.id, formPassword);
      showSuccessMessage(`Password reset for "${selectedUser.username}"`);
      setShowPasswordModal(false);
      resetForm();
      loadAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    setError(null);
    try {
      await deleteUser(selectedUser.id);
      showSuccessMessage(`User "${selectedUser.username}" deleted`);
      setShowDeleteModal(false);
      setSelectedUser(null);
      loadUsers();
      loadAuditLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormUsername('');
    setFormPassword('');
    setFormRole('viewer');
    setFormIsActive(true);
    setSelectedUser(null);
  };

  const openEditModal = (user: AuthUser) => {
    setSelectedUser(user);
    setFormUsername(user.username);
    setFormRole(user.role);
    setFormIsActive(user.is_active !== false);
    setShowEditModal(true);
  };

  const openPasswordModal = (user: AuthUser) => {
    setSelectedUser(user);
    setFormPassword('');
    setShowPasswordModal(true);
  };

  const openDeleteModal = (user: AuthUser) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getRoleBadge = (role: string) => {
    const styles = {
      admin: 'bg-red-100 text-red-700 border-red-200',
      manager: 'bg-amber-100 text-amber-700 border-amber-200',
      viewer: 'bg-blue-100 text-blue-700 border-blue-200',
    };
    return styles[role as keyof typeof styles] || styles.viewer;
  };

  const getActionIcon = (action: string) => {
    if (action.includes('LOGIN')) return <Key size={14} />;
    if (action.includes('CREATE')) return <Plus size={14} />;
    if (action.includes('UPDATE') || action.includes('CHANGE')) return <Edit2 size={14} />;
    if (action.includes('DELETE')) return <Trash2 size={14} />;
    if (action.includes('RESET')) return <Key size={14} />;
    return <Activity size={14} />;
  };

  if (currentUser?.role !== 'admin') {
    return (
      <Card title="User Management" icon={<Users size={20} />}>
        <div className="text-center py-8">
          <Shield size={48} className="mx-auto mb-4 text-surface-400" />
          <p className="text-surface-600">Admin access required to manage users.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-primary-500" />
          <div>
            <h2 className="text-xl font-bold text-surface-800">User Management</h2>
            <p className="text-sm text-surface-500">{users.length} users registered</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { loadUsers(); loadAuditLog(); }}
            loading={loading}
            icon={<RefreshCw size={16} />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            icon={<Plus size={16} />}
          >
            Add User
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle size={18} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle size={18} />
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'users' ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-600'
          }`}
        >
          <Users size={16} />
          Users
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'audit' ? 'bg-white text-primary-600 shadow-sm' : 'text-surface-600'
          }`}
        >
          <Activity size={16} />
          Audit Log
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <Card compact>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-3 px-3">User</th>
                  <th className="text-left py-3 px-3">Role</th>
                  <th className="text-left py-3 px-3">Status</th>
                  <th className="text-left py-3 px-3">Last Login</th>
                  <th className="text-left py-3 px-3">Created</th>
                  <th className="text-right py-3 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-primary-600 font-medium text-sm">
                            {user.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-surface-800">{user.username}</span>
                        {user.id === currentUser?.id && (
                          <span className="text-xs text-surface-400">(you)</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getRoleBadge(user.role)}`}>
                        <Shield size={12} />
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {user.is_active !== false ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <UserCheck size={14} />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-surface-400">
                          <UserX size={14} />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-surface-500">
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatDate(user.last_login)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-surface-500">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-1.5 text-surface-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                          title="Edit user"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => openPasswordModal(user)}
                          className="p-1.5 text-surface-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                          title="Reset password"
                        >
                          <Key size={14} />
                        </button>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => openDeleteModal(user)}
                            className="p-1.5 text-surface-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete user"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <Card compact>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {auditLogs.length === 0 ? (
              <p className="text-center text-surface-500 py-8">No audit logs available</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-surface-50 rounded-lg">
                  <div className="p-1.5 bg-surface-200 rounded">
                    {getActionIcon(log.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-surface-800">{log.username || 'Unknown'}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-surface-200 rounded text-surface-600">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {log.details && (
                      <p className="text-sm text-surface-500 mt-0.5">{log.details}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-surface-400">
                      <span>{formatDate(log.created_at)}</span>
                      {log.ip_address && <span>IP: {log.ip_address}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-surface-800 mb-4">Create New User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Username</label>
                <Input
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Password</label>
                <Input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Min 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Role</label>
                <Select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  options={[
                    { value: 'viewer', label: 'Viewer - Read only access' },
                    { value: 'manager', label: 'Manager - Can modify data' },
                    { value: 'admin', label: 'Admin - Full access' },
                  ]}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateUser} loading={loading} className="flex-1">
                Create User
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-surface-800 mb-4">Edit User</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Username</label>
                <Input
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Role</label>
                <Select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  options={[
                    { value: 'viewer', label: 'Viewer - Read only access' },
                    { value: 'manager', label: 'Manager - Can modify data' },
                    { value: 'admin', label: 'Admin - Full access' },
                  ]}
                  disabled={selectedUser.id === currentUser?.id}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-surface-300 text-primary-500 focus:ring-primary-500"
                    disabled={selectedUser.id === currentUser?.id}
                  />
                  <span className="text-sm text-surface-700">Account active</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowEditModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="primary" onClick={handleUpdateUser} loading={loading} className="flex-1">
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-surface-800 mb-4">
              Reset Password for "{selectedUser.username}"
            </h3>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">New Password</label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowPasswordModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="primary" onClick={handleResetPassword} loading={loading} className="flex-1">
                Reset Password
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-surface-800 mb-2">Delete User</h3>
            <p className="text-surface-600 mb-4">
              Are you sure you want to delete <strong>{selectedUser.username}</strong>? 
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteUser} loading={loading} className="flex-1">
                Delete User
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
