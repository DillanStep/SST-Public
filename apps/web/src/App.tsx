import { lazy, Suspense, useState, useEffect, useCallback, type ReactNode } from 'react';
import { LayoutDashboard, Search, Users, Settings, Menu, X, Map, Store, FileText, History, TrendingUp, Shield, LogOut, Car, LifeBuoy, Trophy } from 'lucide-react';
import { ConnectionBar } from './components/features/ConnectionBar';
import { LoginPage } from './components/features/LoginPage';
import { UpdatePrompt } from './components/features/UpdatePrompt';
import { UpdateStatusBadge } from './components/features/UpdateStatusBadge';
import { VersionCorner } from './components/features/VersionCorner';
import { ACTIVE_SERVER_CHANGED_EVENT, getActiveServer, getActiveServerId } from './services/serverManager';
import { AuthCheckTransientError, checkAuth, getAuthToken, logout, type User } from './services/auth';
import api from './services/api';

type TabType = 'dashboard' | 'items' | 'players' | 'leaderboard' | 'map' | 'vehicles' | 'market' | 'economy' | 'logs' | 'history' | 'users' | 'settings';
const DISCORD_SUPPORT_URL = 'https://discord.gg/jv52WVbFdj';

const PlayerDashboard = lazy(() => import('./components/features/PlayerDashboard').then((module) => ({ default: module.PlayerDashboard })));
const ItemSearch = lazy(() => import('./components/features/ItemSearch').then((module) => ({ default: module.ItemSearch })));
const PlayerManager = lazy(() => import('./components/features/PlayerManager').then((module) => ({ default: module.PlayerManager })));
const PlayerLeaderboard = lazy(() => import('./components/features/PlayerLeaderboard').then((module) => ({ default: module.PlayerLeaderboard })));
const FullPageMap = lazy(() => import('./components/features/FullPageMap').then((module) => ({ default: module.FullPageMap })));
const ServerSettings = lazy(() => import('./components/features/ServerSettings').then((module) => ({ default: module.ServerSettings })));
const MarketEditor = lazy(() => import('./components/features/MarketEditor').then((module) => ({ default: module.MarketEditor })));
const LogViewer = lazy(() => import('./components/features/LogViewer').then((module) => ({ default: module.LogViewer })));
const PlayerHistory = lazy(() => import('./components/features/PlayerHistory').then((module) => ({ default: module.PlayerHistory })));
const EconomyDashboard = lazy(() => import('./components/features/EconomyDashboard').then((module) => ({ default: module.EconomyDashboard })));
const UserManagement = lazy(() => import('./components/features/UserManagement').then((module) => ({ default: module.UserManagement })));
const VehicleDashboard = lazy(() => import('./components/features/VehicleDashboard').then((module) => ({ default: module.VehicleDashboard })));

function FeatureLoading() {
  return (
    <div className="min-h-[240px] flex items-center justify-center">
      <div className="w-9 h-9 border-2 border-surface-200 border-t-surface-600 rounded-full animate-spin" />
    </div>
  );
}

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeServerName, setActiveServerName] = useState<string>('');
  const [activeServerId, setActiveServerIdState] = useState<string | null>(() => getActiveServerId());
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Check auth on mount
  useEffect(() => {
    let didFinish = false;
    
    const checkSession = async () => {
      try {
        const result = await checkAuth();
        if (result?.user) {
          setUser(result.user);
        }
      } catch (err) {
        if (err instanceof AuthCheckTransientError) {
          console.warn('Auth check skipped:', err.message);
        } else {
          console.error('Auth check failed:', err);
        }
      } finally {
        didFinish = true;
        setAuthChecking(false);
      }
    };
    
    // Safety timeout - don't stay on loading screen forever
    const safetyTimeout = setTimeout(() => {
      if (!didFinish) {
        console.warn('Auth check timed out, proceeding to login');
        setAuthChecking(false);
      }
    }, 8000);
    
    checkSession();
    
    return () => clearTimeout(safetyTimeout);
  }, []);

  // Handle login
  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore errors
    }
    setUser(null);
    setIsConnected(false);
  };

  // Load active server summary
  const loadActiveServerSummary = useCallback(() => {
    const server = getActiveServer();
    setActiveServerName(server?.name || '');
    setActiveServerIdState(server?.id || getActiveServerId());
  }, []);

  useEffect(() => {
    loadActiveServerSummary();
  }, [loadActiveServerSummary]);

  // Handle server change from settings
  const handleServerChange = useCallback(async () => {
    loadActiveServerSummary();
    api.loadActiveServer();
    setIsConnected(false);

    if (!getAuthToken()) {
      setUser(null);
      return;
    }

    try {
      const result = await checkAuth();
      setUser(result?.user ?? null);
    } catch (err) {
      if (err instanceof AuthCheckTransientError) {
        console.warn('Server switch auth check skipped:', err.message);
        return;
      }

      setUser(null);
    }
  }, [loadActiveServerSummary]);

  useEffect(() => {
    const handleActiveServerChanged = () => {
      void handleServerChange();
    };

    window.addEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleActiveServerChanged);
    return () => window.removeEventListener(ACTIVE_SERVER_CHANGED_EVENT, handleActiveServerChanged);
  }, [handleServerChange]);

  const tabs: { id: TabType; label: string; icon: ReactNode; adminOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'map', label: 'Live Map', icon: <Map size={20} /> },
    { id: 'items', label: 'Item Search', icon: <Search size={20} /> },
    { id: 'players', label: 'Player Manager', icon: <Users size={20} /> },
    { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy size={20} /> },
    { id: 'vehicles', label: 'Vehicles', icon: <Car size={20} /> },
    { id: 'history', label: 'Player History', icon: <History size={20} /> },
    { id: 'economy', label: 'Economy', icon: <TrendingUp size={20} /> },
    { id: 'market', label: 'Market Editor', icon: <Store size={20} /> },
    { id: 'logs', label: 'Server Logs', icon: <FileText size={20} /> },
    { id: 'users', label: 'Users', icon: <Shield size={20} />, adminOnly: true },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
  ];

  // Filter tabs based on user role
  const visibleTabs = tabs.filter(tab => !tab.adminOnly || user?.role === 'admin');

  // Show loading spinner while checking auth
  if (authChecking) {
    return (
      <>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center animate-fade-in">
            <div className="w-12 h-12 border-3 border-surface-200 border-t-surface-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-surface-500">Loading...</p>
          </div>
        </div>
        <VersionCorner />
      </>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return (
      <>
        <LoginPage onLogin={handleLogin} />
        <VersionCorner />
      </>
    );
  }

  // Full-page modes (map, history, vehicles)
  const isFullPageMode = (activeTab === 'map' || activeTab === 'history' || activeTab === 'vehicles') && isConnected;

  if (isFullPageMode) {
    return (
      <div className="h-screen w-screen flex flex-col">
        <UpdatePrompt user={user} />
        <VersionCorner />
        {/* Minimal Top Bar */}
        <div className="h-14 bg-white border-b border-surface-200 flex items-center px-4 gap-4 flex-shrink-0 z-[1002]">
          <div className="flex items-center">
            <img 
              src="/banners/LOGO.png"
              alt="SST Dashboard" 
              className="h-9 w-auto max-w-52 object-contain"
            />
          </div>
          
          {/* Quick Nav */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-surface-800 text-white shadow-sm'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-800'
                }`}
              >
                {tab.icon}
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* User Info & Logout */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-surface-600 hidden md:block">{user.username}</span>
            {user.role === 'admin' && (
              <UpdateStatusBadge className="hidden w-44 xl:flex" />
            )}
            <a
              href={DISCORD_SUPPORT_URL}
              target="_blank"
              rel="noreferrer"
              className="p-2 text-surface-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200"
              title="Discord Support"
            >
              <LifeBuoy size={18} />
            </a>
            <button
              onClick={handleLogout}
              className="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>

          {/* Connection Bar */}
          <ConnectionBar 
            isConnected={isConnected}
            onConnected={() => setIsConnected(true)}
            onDisconnected={() => setIsConnected(false)}
          />
        </div>
        
        {/* Full Page Content */}
        <div className="flex-1">
          <Suspense key={activeServerId || 'no-server'} fallback={<FeatureLoading />}>
          {activeTab === 'map' && <FullPageMap isConnected={isConnected} />}
          {activeTab === 'history' && <PlayerHistory isConnected={isConnected} />}
          {activeTab === 'vehicles' && <VehicleDashboard isConnected={isConnected} />}
          </Suspense>
        </div>
      </div>
    );
  }

  // Standard layout for other tabs
  return (
    <div className="min-h-screen bg-surface-50 flex">
      <UpdatePrompt user={user} />
      <VersionCorner />
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col bg-white border-r border-surface-200 transition-all duration-300 ease-out sticky top-0 h-screen ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        {/* Logo */}
        <div className="flex items-center justify-center px-4 h-16 border-b border-surface-200">
          <img 
            src={sidebarOpen ? "/banners/LOGO.png" : "/banners/LOGO-mark.png"}
            alt="SST Dashboard" 
            className={`object-contain transition-all duration-300 ${sidebarOpen ? 'h-10 w-auto max-w-full' : 'h-10 w-10'}`}
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <ul className="space-y-1">
            {visibleTabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-surface-800 text-white shadow-sm'
                      : 'text-surface-600 hover:bg-surface-100 hover:text-surface-800'
                  }`}
                >
                  <span className="flex-shrink-0">{tab.icon}</span>
                  {sidebarOpen && <span>{tab.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-surface-200">
          {sidebarOpen && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-surface-100 flex items-center justify-center">
                <span className="text-surface-600 font-semibold text-sm">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-surface-800 truncate">{user.username}</div>
                <div className="text-xs text-surface-500 capitalize">{user.role}</div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
          {!sidebarOpen && (
            <>
              <a
                href={DISCORD_SUPPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="mb-2 flex w-full items-center justify-center rounded-xl p-2.5 text-surface-400 transition-all duration-200 hover:bg-indigo-50 hover:text-indigo-600"
                title="Discord Support"
              >
                <LifeBuoy size={18} />
              </a>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center p-2.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-200 mb-3"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </>
          )}
          {sidebarOpen && activeServerName && (
            <div className="text-xs text-surface-400 mb-2 truncate px-1">
              {activeServerName}
            </div>
          )}
          {sidebarOpen && (
            <a
              href={DISCORD_SUPPORT_URL}
              target="_blank"
              rel="noreferrer"
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm font-medium text-surface-600 transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <LifeBuoy size={16} />
              Support
            </a>
          )}
          {user.role === 'admin' && (
            <UpdateStatusBadge compact={!sidebarOpen} className="mb-3" />
          )}
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm ${
            isConnected 
              ? 'bg-sky-50 text-sky-700'
              : 'bg-surface-100 text-surface-600'
          }`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-sky-500' : 'bg-surface-400'}`} />
            {sidebarOpen && <span>{isConnected ? 'API connected' : 'API disconnected'}</span>}
          </div>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-4 border-t border-surface-200 text-surface-500 hover:text-surface-700 hover:bg-surface-50 transition-all duration-200"
        >
          <Settings size={20} className={`transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} />
        </button>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-surface-200">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <img src="/banners/LOGO-mark.png" alt="SST" className="h-9 w-9 object-contain" />
            <h1 className="text-base font-bold text-surface-800">SST Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Mini connection indicator for mobile */}
            <div
              className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-sky-500' : 'bg-surface-400'}`}
              title={isConnected ? 'API connected' : 'API disconnected'}
            />
            <button
              className="p-2 text-surface-600 hover:text-surface-800 hover:bg-surface-100 rounded-xl transition-all"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="bg-white border-t border-surface-200 px-4 py-3 space-y-1 animate-fade-in-down">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-surface-800 text-white'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-800'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            <a
              href={DISCORD_SUPPORT_URL}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-indigo-700 hover:bg-indigo-50 transition-all duration-200"
            >
              <LifeBuoy size={20} />
              Support
            </a>
            {user.role === 'admin' && (
              <UpdateStatusBadge />
            )}
            {/* Logout button for mobile */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-all duration-200"
            >
              <LogOut size={20} />
              Logout ({user.username})
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 md:overflow-auto">
        {/* Top Bar with Connection */}
        <div className="hidden md:flex items-center justify-end px-6 py-4 border-b border-surface-200 bg-white">
          <ConnectionBar 
            isConnected={isConnected}
            onConnected={() => setIsConnected(true)}
            onDisconnected={() => setIsConnected(false)}
          />
        </div>

        <div className="p-4 sm:p-5 lg:p-6 pt-18 md:pt-5 space-y-5">
          <Suspense key={activeServerId || 'no-server'} fallback={<FeatureLoading />}>
            {activeTab === 'dashboard' && (
              <PlayerDashboard isConnected={isConnected} />
            )}

            {activeTab === 'items' && (
              <ItemSearch isConnected={isConnected} />
            )}

            {activeTab === 'players' && (
              <PlayerManager isConnected={isConnected} />
            )}

            {activeTab === 'leaderboard' && (
              <PlayerLeaderboard isConnected={isConnected} />
            )}

            {activeTab === 'market' && (
              <MarketEditor isConnected={isConnected} />
            )}

            {activeTab === 'economy' && (
              <EconomyDashboard isConnected={isConnected} />
            )}

            {activeTab === 'logs' && (
              <LogViewer isConnected={isConnected} />
            )}

            {activeTab === 'users' && (
              <UserManagement currentUser={user} />
            )}

            {activeTab === 'history' && !isConnected && (
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-8 sm:p-12 text-center animate-fade-in">
                <History size={48} className="mx-auto mb-4 text-surface-300" />
                <p className="text-surface-500">Connect to the API to view player history.</p>
              </div>
            )}

            {activeTab === 'map' && !isConnected && (
              <div className="bg-white rounded-2xl shadow-sm border border-surface-200 p-8 sm:p-12 text-center animate-fade-in">
                <Map size={48} className="mx-auto mb-4 text-surface-300" />
                <p className="text-surface-500">Connect to the API to view the live map.</p>
              </div>
            )}

            {activeTab === 'settings' && (
              <ServerSettings onServerChange={handleServerChange} />
            )}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default App;
