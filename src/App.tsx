import React, { useState, useEffect, useCallback } from 'react';
import { ViewMode, Profile, Roast, Battle } from './types';
import { DataStore, subscribeToStore } from './lib/dataStore';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { Navbar } from './components/Navbar';
import { SidebarLeft } from './components/SidebarLeft';
import { SidebarRight } from './components/SidebarRight';
import { FeedView } from './views/FeedView';
import { LeaderboardView } from './views/LeaderboardView';
import { BattleView } from './views/BattleView';
import { ProfileDetailView } from './views/ProfileDetailView';
import { PlatformSeoView } from './views/PlatformSeoView';
import { AdminView } from './views/AdminView';
import { ExploreView } from './views/ExploreView';
import { AdminFeedView } from './views/AdminFeedView';
import { SubmitModal } from './components/SubmitModal';
import { OgCardModal } from './components/OgCardModal';
import { RoastInviteModal } from './components/RoastInviteModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { track } from './lib/analytics';
import { Flame, Shield, Heart, Github, ExternalLink, Globe, FileText, Scale } from 'lucide-react';
import { MobileBottomNav } from './components/MobileBottomNav';
import { MobileHeader } from './components/MobileHeader';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { WorldLeaderboardView } from './views/WorldLeaderboardView';
import { PrivacyView } from './views/PrivacyView';
import { TermsView } from './views/TermsView';
import { AuthView } from './views/AuthView';
import { AdvancedAdminView } from './views/AdvancedAdminView';
import { PremiumModal } from './components/PremiumModal';
import { UserProfileView } from './views/UserProfileView';
import { SettingsView } from './views/SettingsView';
import { LoginRequiredModal } from './components/LoginRequiredModal';
import { OnboardingModal, hasCompletedOnboarding } from './components/OnboardingModal';
import { DmView } from './views/DmView';
import { RateAppModal } from './components/RateAppModal';
import { OfflineBanner } from './components/OfflineBanner';
import { LiveStats } from './components/LiveStats';
import { NotificationsView } from './views/NotificationsView';
import { useAuth } from './lib/auth';
import { initMobileApp } from './lib/mobileSetup';
// Phase 2: Hot Seat
import { HotSeatView } from './views/HotSeatView';
// Phase 5: Burn Report
import { BurnReportView } from './views/BurnReportView';
// Phase 6: Challenges
import { ChallengesView } from './views/ChallengesView';
// Phase 8: Trending
import { TrendingView } from './views/TrendingView';
// Phase 9: Enhanced Leaderboard
import { EnhancedLeaderboardView } from './views/EnhancedLeaderboardView';
import { registerForPushNotifications } from './lib/pushNotifications';
import { notifyRoastOnProfile, notifyUpvoteMilestone } from './lib/notify';
import { notificationQueue } from './lib/notificationQueue';
import { updateActivity } from './lib/activity';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { recordRoastGiven } from './lib/karma';
import { requestWebPushPermission } from './lib/pushNotifications';

export default function App() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roasts, setRoasts] = useState<Roast[]>([]);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  
  const [currentView, setCurrentView] = useState<ViewMode>('feed');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [seoPlatformParam, setSeoPlatformParam] = useState<string>('linkedin');
  const [loginRequiredAction, setLoginRequiredAction] = useState<string>('');
  const [profileUsername, setProfileUsername] = useState<string>('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dmThreadId, setDmThreadId] = useState<string | undefined>();
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  // Modals
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [activeOgShare, setActiveOgShare] = useState<{ roast: Roast; profile: Profile } | null>(null);
  const [inviteModalUsername, setInviteModalUsername] = useState<string | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Mobile app initialization
  useEffect(() => {
    initMobileApp();
  }, []);

  // Push notifications setup (PWA browser only)
  useEffect(() => {
    if (user?.id) {
      registerForPushNotifications(user.id);
      updateActivity(user.id);
    }
  }, [user]);

  const addToast = useCallback((text: string, subtext?: string, type: 'flame' | 'warning' | 'success' | 'danger' = 'flame') => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5);
    setToasts(prev => [...prev, { id, text, subtext, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Sync state from DataStore (async)
  const refreshState = useCallback(async () => {
    const [p, r, b] = await Promise.all([
      DataStore.getProfiles(),
      DataStore.getRoasts(),
      DataStore.getBattles(),
    ]);
    setProfiles(p);
    setRoasts(r);
    setBattles(b);
  }, []);

  // Initial data load
  useEffect(() => {
    const load = async () => {
      setDataLoading(true);
      await refreshState();
      setDataLoading(false);
    };
    load();
  }, [refreshState]);

  // Handle URL Hash navigation (Feed, Post, Top, Battle, Submit, Admin, SEO Platforms, Auth, Settings, User Profile)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash.startsWith('post/')) {
        const id = hash.replace('post/', '');
        setSelectedProfileId(id);
        setCurrentView('profile');
      } else if (hash.startsWith('roast/')) {
        const platform = hash.replace('roast/', '');
        setSeoPlatformParam(platform);
        setCurrentView('platformSeo');
      } else if (hash.startsWith('u/')) {
        const username = hash.replace('u/', '');
        setProfileUsername(username);
        setCurrentView('userProfile');
      } else if (hash === 'top') {
        setCurrentView('top');
      } else if (hash === 'battle') {
        setCurrentView('battle');
      } else if (hash === 'admin') {
        setCurrentView('admin');
      } else if (hash === 'explore') {
        setCurrentView('explore');
      } else if (hash === 'admin-feed') {
        setCurrentView('adminFeed');
      } else if (hash === 'submit') {
        setIsSubmitOpen(true);
      } else if (hash === 'auth') {
        setCurrentView('auth');
      } else if (hash === 'dm') {
        setCurrentView('dm');
      } else if (hash === 'settings') {
        setCurrentView('settings');
      } else if (hash === 'notifications') {
        setCurrentView('notifications');
      } else if (hash.startsWith('hot-seat/')) {
        setCurrentView('hotSeat');
      } else if (hash === 'burn-report') {
        setCurrentView('burnReport');
      } else if (hash === 'challenges') {
        setCurrentView('challenges');
      } else if (hash === 'trending') {
        setCurrentView('trending');
      } else if (hash === '404') {
        setCurrentView('404');
      } else {
        setCurrentView('feed');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Keyboard shortcuts: 'r' to focus roast input, 'j'/'k' to navigate feed
  useEffect(() => {
    let currentCardIndex = 0;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        const inputEl = document.querySelector('textarea, input[placeholder*="roast"], input[placeholder*="Roast"]') as HTMLElement;
        if (inputEl) {
          inputEl.focus();
          addToast('Shortcut [R]', 'Focused roast input chamber.', 'flame');
        }
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        const cards = document.querySelectorAll('article[id^="feed-card-"]');
        if (cards.length > 0) {
          currentCardIndex = Math.min(cards.length - 1, currentCardIndex + 1);
          cards[currentCardIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const cards = document.querySelectorAll('article[id^="feed-card-"]');
        if (cards.length > 0) {
          currentCardIndex = Math.max(0, currentCardIndex - 1);
          cards[currentCardIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addToast]);

  // Realtime subscription (Store + Supabase Realtime if active)
  useEffect(() => {
    const unsubscribe = subscribeToStore((event) => {
      refreshState();
    });

    // If real Supabase configured, subscribe to realtime channels
    if (isSupabaseConfigured && supabase) {
      const channel = supabase
        .channel('burnboard_realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roasts' }, (payload) => {
          refreshState();
          addToast('🔥 New Roast Dropped!', 'Someone just roasted a user in realtime.');
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'roasts' }, (payload) => {
          refreshState();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload) => {
          refreshState();
          addToast('🎯 New Target in the Hot Seat', 'A new profile is ready to be roasted.');
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
          refreshState();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'battles' }, (payload) => {
          refreshState();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battles' }, (payload) => {
          refreshState();
        })
        .subscribe();

      return () => {
        unsubscribe();
        supabase.removeChannel(channel);
      };
    }

    return () => {
      unsubscribe();
    };
  }, [refreshState, addToast]);

  const handleNavigate = (view: ViewMode) => {
    setCurrentView(view);
    if (view === 'feed') {
      window.location.hash = '';
      setSelectedProfileId(null);
    } else if (view === 'top') {
      window.location.hash = '#top';
    } else if (view === 'battle') {
      window.location.hash = '#battle';
    } else if (view === 'admin') {
      window.location.hash = '#admin';
    }
  };

  const handleOpenProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    setCurrentView('profile');
    window.location.hash = `#post/${profileId}`;
    track('profile_viewed', { profileId });
  };

  const handleBackToFeed = () => {
    setCurrentView('feed');
    setSelectedProfileId(null);
    window.location.hash = '';
  };

  // Profile creation
  const handleCreateProfile = async (data: { username: string; platform: string; bio: string }): Promise<string> => {
    const newProfile = await DataStore.createProfile(data);
    await refreshState();
    track('profile_submitted', { username: data.username, platform: data.platform });
    addToast('Target Locked in Hot Seat 🔥', `@${newProfile.username} is now open for human roasts.`);
    handleOpenProfile(newProfile.id);
    return newProfile.id;
  };

  // Roast submission
  const handleSubmitRoast = async (profileId: string, roastText: string, anonId: string, savageLevel?: string) => {
    await DataStore.createRoast(profileId, roastText, anonId, user?.id, savageLevel);
    await refreshState();
    if (user?.id) updateActivity(user.id);
    
    // Increment user local roast streak count (used for 10-roast ad free unlock)
    try {
      const currentCount = parseInt(localStorage.getItem('burnboard_user_roast_count') || '0', 10);
      const nextCount = currentCount + 1;
      localStorage.setItem('burnboard_user_roast_count', nextCount.toString());
      if (nextCount === 10) {
        addToast('👑 Achievement Unlocked!', '10 burns delivered! Ad slots removed permanently.');
      }
    } catch {}

    // Record karma for real-time gamification
    await recordRoastGiven(user?.id || null, anonId);

    // Request browser push permission on first roast
    try {
      const roastCount = parseInt(localStorage.getItem('burnboard_user_roast_count') || '0', 10);
      if (roastCount <= 1) {
        requestWebPushPermission();
      }
    } catch {}

    track('roast_submitted', { profileId, anonId });
    addToast('Brutal Burn Delivered 🔥', `Your anonymous roast was published.`);

    // Notify profile owner about the new roast
    const roastTarget = profiles.find(p => p.id === profileId);
    if (roastTarget?.user_id && roastTarget.user_id !== user?.id) {
      const myUsername = userProfile?.username || 'Anonymous';
      notifyRoastOnProfile(roastTarget.user_id, myUsername, roastText, profileId);
    }

    // Trigger growth & invite viral modal
    if (roastTarget) {
      setInviteModalUsername(roastTarget.username);
    }
  };

  // Upvote (requires login)
  const handleUpvoteRoast = async (roastId: string) => {
    if (!user) {
      setLoginRequiredAction('upvote');
      return;
    }
    await DataStore.upvoteRoast(roastId);
    await refreshState();
    track('upvote_clicked', { roastId });
    if (user.id) updateActivity(user.id);
    try { navigator.vibrate?.(50); } catch {}

    // Notify roast author on milestone (every 10 upvotes)
    const roast = roasts.find(r => r.id === roastId);
    if (roast?.user_id && roast.user_id !== user.id) {
      notifyUpvoteMilestone(roast.user_id, (roast.upvotes || 0) + 1, roast.profile_id);
    }
  };

  // React (requires login)
  const handleReactRoast = async (roastId: string, type: 'haha' | 'brutal' | 'cry') => {
    if (!user) {
      setLoginRequiredAction('react');
      return;
    }
    await DataStore.reactRoast(roastId, type);
    await refreshState();
    track('reaction_clicked', { roastId, type });
  };

  // Battle Vote (requires login)
  const handleVoteBattle = async (battleId: string, candidate: 1 | 2) => {
    if (!user) {
      setLoginRequiredAction('vote in battles');
      return;
    }
    await DataStore.voteBattle(battleId, candidate);
    await refreshState();
    track('battle_voted', { battleId, candidate });
    try { navigator.vibrate?.(50); } catch {}
  };

  const handleNextBattle = async () => {
    await DataStore.createRandomBattle();
    await refreshState();
  };

  // Share OG Card
  const handleShareRoast = (roast: Roast) => {
    const targetProfile = profiles.find(p => p.id === roast.profile_id);
    if (targetProfile) {
      setActiveOgShare({ roast, profile: targetProfile });
      track('share_clicked', { roastId: roast.id, username: targetProfile.username });
    }
  };

  const handleReportRoast = (roastId: string) => {
    addToast('Report Received', 'Our human moderation queue will inspect this burn.', 'warning');
  };

  const handleResetData = async () => {
    await DataStore.resetDefaults();
    await refreshState();
    addToast('Database Reset', 'All data cleared.');
  };

  // Load more profiles for infinite scroll feel
  const handleLoadMore = async () => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await refreshState();
    addToast('Feed Refreshed 🔥', 'Loaded latest community burns');
  };

  // Show onboarding for new users after signup
  useEffect(() => {
    if (authLoading || !user) return;
    // Check if this is a new user (created within last 5 minutes)
    const userCreated = user.created_at ? new Date(user.created_at).getTime() : 0;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const isNewUser = userCreated > fiveMinutesAgo;

    if (isNewUser && !hasCompletedOnboarding()) {
      // Small delay so the feed loads first
      const timer = setTimeout(() => setShowOnboarding(true), 800);
      return () => clearTimeout(timer);
    }
  }, [user, authLoading]);

  // Count user's roasts for onboarding step 2
  const userRoastCount = parseInt(typeof window !== 'undefined' ? localStorage.getItem('my_roast_count') || '0' : '0', 10);

  // Konami Code Easter Egg
  const [showSecretRoast, setShowSecretRoast] = useState(false);
  useEffect(() => {
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;
    const handler = (e: KeyboardEvent) => {
      if (e.key === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
          setShowSecretRoast(true);
          konamiIndex = 0;
          try { navigator.vibrate?.(200); } catch {}
          setTimeout(() => setShowSecretRoast(false), 5000);
        }
      } else {
        konamiIndex = 0;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Pull-to-refresh for mobile
  const [isRefreshing, setIsRefreshing] = useState(false);
  useEffect(() => {
    let startY = 0;
    let pulling = false;
    const el = document.getElementById('main-scroll-feed');
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      const diff = e.touches[0].clientY - startY;
      if (diff > 80 && !isRefreshing) {
        setIsRefreshing(true);
        try { navigator.vibrate?.(30); } catch {}
      }
    };
    const onTouchEnd = () => {
      if (isRefreshing) {
        refreshState();
        setTimeout(() => setIsRefreshing(false), 800);
      }
      pulling = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [isRefreshing, refreshState]);

  // PWA Install prompt
  const { isInstallable, promptInstall } = useInstallPrompt();

  const activeProfile = profiles.find(p => p.id === selectedProfileId);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0] flex flex-col font-sans selection:bg-[#ff4d00] selection:text-black">
      {/* Offline Banner */}
      <OfflineBanner />

      {/* Mobile Header (hidden on desktop) */}
      <MobileHeader
        onNavigate={(view) => window.location.hash = view.startsWith('#') ? view : `#${view}`}
        onShowToast={(text, sub) => addToast(text, sub, 'flame')}
      />

      {/* Primary Sticky Header Nav (desktop only) */}
      <div className="hidden md:block">
        <Navbar
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenSubmit={() => setIsSubmitOpen(true)}
          onResetData={handleResetData}
          onShowToast={(text, sub) => addToast(text, sub, 'flame')}
        />
      </div>

      {/* Main App Canvas */}
      <div className="flex flex-1 overflow-hidden max-w-7xl w-full mx-auto pt-14 md:pt-0 pb-16 md:pb-0">
        {/* Left Sidebar */}
        <SidebarLeft
          currentView={currentView}
          onNavigate={handleNavigate}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          profiles={profiles}
        />

        {/* Center Main Scroll View */}
        <main
          id="main-scroll-feed"
          className="flex-1 overflow-y-auto bg-[#0d0d0d] p-4 sm:p-6 border-x border-[#222]/60 min-w-0 flex flex-col justify-between"
        >
          {dataLoading ? (
            <div className="space-y-6 py-8">
              {/* Loading skeletons */}
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-[#111] border border-[#222] rounded-2xl p-5 animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#222]" />
                    <div className="flex-1">
                      <div className="h-3 bg-[#222] rounded w-24 mb-2" />
                      <div className="h-2 bg-[#222] rounded w-16" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-[#222] rounded w-full" />
                    <div className="h-3 bg-[#222] rounded w-3/4" />
                    <div className="h-3 bg-[#222] rounded w-1/2" />
                  </div>
                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[#222]">
                    <div className="h-2 bg-[#222] rounded w-12" />
                    <div className="h-2 bg-[#222] rounded w-12" />
                    <div className="h-2 bg-[#222] rounded w-12" />
                  </div>
                </div>
              ))}
              <div className="text-center py-4">
                <p className="text-xs font-mono text-zinc-500 animate-pulse">Loading burns...</p>
              </div>
            </div>
          ) : (
          <div>
            {currentView === 'feed' && (
              <FeedView
                profiles={profiles}
                roasts={roasts}
                selectedCategory={selectedCategory}
                onOpenProfile={handleOpenProfile}
                onOpenSubmit={() => setIsSubmitOpen(true)}
                onUpvoteRoast={handleUpvoteRoast}
                onReactRoast={handleReactRoast}
                onSubmitRoast={handleSubmitRoast}
                onShareRoast={handleShareRoast}
                onReportRoast={handleReportRoast}
                onTriggerWarning={(msg, sub) => addToast(msg, sub, 'warning')}
                onLoadMore={handleLoadMore}
              />
            )}

            {currentView === 'top' && (
              <LeaderboardView
                profiles={profiles}
                roasts={roasts}
                onOpenProfile={handleOpenProfile}
                onOpenSubmit={() => setIsSubmitOpen(true)}
              />
            )}

            {currentView === 'battle' && (
              <BattleView
                battles={battles}
                profiles={profiles}
                roasts={roasts}
                onVoteBattle={handleVoteBattle}
                onNextBattle={handleNextBattle}
                onOpenProfile={handleOpenProfile}
                onShowToast={(text, sub) => addToast(text, sub, 'flame')}
              />
            )}

            {currentView === 'profile' && activeProfile && (
              <ProfileDetailView
                profile={activeProfile}
                roasts={roasts.filter(r => r.profile_id === activeProfile.id)}
                onBack={handleBackToFeed}
                onUpvoteRoast={handleUpvoteRoast}
                onReactRoast={handleReactRoast}
                onSubmitRoast={handleSubmitRoast}
                onShareRoast={handleShareRoast}
                onReportRoast={handleReportRoast}
                onTriggerWarning={(msg, sub) => addToast(msg, sub, 'warning')}
                onShowToast={(text, sub) => addToast(text, sub, 'flame')}
              />
            )}

            {currentView === 'platformSeo' && (
              <PlatformSeoView
                platform={seoPlatformParam}
                profiles={profiles}
                roasts={roasts}
                onBack={handleBackToFeed}
                onSelectProfile={handleOpenProfile}
                onOpenSubmit={() => setIsSubmitOpen(true)}
                onUpvoteRoast={handleUpvoteRoast}
                onReactRoast={handleReactRoast}
                onSubmitRoast={handleSubmitRoast}
                onShareRoast={handleShareRoast}
                onReportRoast={handleReportRoast}
                onTriggerWarning={(msg) => addToast('Warning', msg, 'danger')}
              />
            )}

            {currentView === 'world' && (
              <EnhancedLeaderboardView
                onBack={handleBackToFeed}
                onOpenProfile={handleOpenProfile}
                onShowToast={(text, sub) => addToast(text, sub, 'flame')}
              />
            )}

            {currentView === 'auth' && (
              <AuthView
                onNavigateBack={() => { window.location.hash = ''; setCurrentView('feed'); }}
                onShowToast={addToast}
              />
            )}

            {currentView === 'settings' && (
              <SettingsView
                onBack={() => setCurrentView('feed')}
                onShowToast={addToast}
              />
            )}

            {currentView === 'userProfile' && (
              <UserProfileView
                username={profileUsername}
                onBack={() => setCurrentView('feed')}
                onShowToast={addToast}
              />
            )}

            {currentView === 'dm' && (
              <DmView
                onBack={() => setCurrentView('feed')}
                onShowToast={addToast}
                initialThreadId={dmThreadId}
              />
            )}

            {currentView === 'notifications' && (
              <NotificationsView
                onBack={() => setCurrentView('feed')}
                onShowToast={(text, sub) => addToast(text, sub, 'flame')}
              />
            )}

            {currentView === 'privacy' && (
              <PrivacyView
                onBack={() => setCurrentView('feed')}
              />
            )}

            {currentView === 'terms' && (
              <TermsView
                onBack={() => setCurrentView('feed')}
              />
            )}

            {currentView === 'hotSeat' && (
              <HotSeatView
                profile={activeProfile || profiles[0]}
                roasts={activeProfile ? roasts.filter(r => r.profile_id === activeProfile.id) : []}
                onBack={handleBackToFeed}
                onSubmitRoast={handleSubmitRoast}
                onUpvoteRoast={handleUpvoteRoast}
                onReactRoast={handleReactRoast}
                onShareRoast={handleShareRoast}
                onReportRoast={handleReportRoast}
                onTriggerWarning={(msg, sub) => addToast(msg, sub, 'warning')}
                onShowToast={(text, sub) => addToast(text, sub, 'flame')}
              />
            )}

            {currentView === 'burnReport' && (
              <BurnReportView
                onBack={handleBackToFeed}
                onShowToast={(text, sub) => addToast(text, sub, 'flame')}
              />
            )}

            {currentView === 'challenges' && (
              <ChallengesView
                onBack={handleBackToFeed}
                onShowToast={(text, sub) => addToast(text, sub, 'flame')}
              />
            )}

            {currentView === 'trending' && (
              <TrendingView
                onOpenProfile={handleOpenProfile}
                onShowToast={(text, sub) => addToast(text, sub, 'flame')}
              />
            )}

            {currentView === 'explore' && (
              <ExploreView
                profiles={profiles}
                roasts={roasts}
                followingUserIds={[]}
                onOpenProfile={handleOpenProfile}
                onUpvoteRoast={handleUpvoteRoast}
                onReactRoast={handleReactRoast}
                onSubmitRoast={handleSubmitRoast}
                onShareRoast={handleShareRoast}
                onReportRoast={handleReportRoast}
                onTriggerWarning={(msg, sub) => addToast(msg, sub, 'warning')}
              />
            )}

            {currentView === 'adminFeed' && (
              <AdminFeedView
                profiles={profiles}
                roasts={roasts}
                onBack={handleBackToFeed}
                onShowToast={(title, msg, type) => {
                  if (type === 'warning' || type === 'success' || type === 'flame' || type === 'danger') {
                    addToast(title, msg, type);
                  } else {
                    addToast(title, msg, 'flame');
                  }
                }}
              />
            )}

            {currentView === 'admin' && (
              <AdvancedAdminView
                onShowToast={(title, msg, type) => {
                  addToast(title, msg, (type as any) || 'flame');
                }}
              />
            )}

            {currentView === '404' && (
              <div className="p-10 text-center bg-[#111] border border-[#222] rounded-2xl space-y-4 font-mono my-8">
                <div className="text-3xl">🏃‍♂️💨</div>
                <h2 className="text-xl font-bold text-white uppercase">This profile escaped the roast</h2>
                <p className="text-xs text-zinc-400">The target you were looking for was deleted or never entered the chamber.</p>
                <button
                  onClick={handleBackToFeed}
                  className="px-5 py-2.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-mono font-black text-xs uppercase rounded-xl"
                >
                  Return to Active Feed
                </button>
              </div>
            )}

            {currentView === 'profile' && !activeProfile && (
              <div className="p-10 text-center bg-[#111] border border-[#222] rounded-2xl space-y-4 my-8">
                <h2 className="text-lg font-bold text-white">Target Profile Not Found</h2>
                <p className="text-xs text-zinc-400">This profile may have retreated from the heat.</p>
                <button
                  onClick={handleBackToFeed}
                  className="px-4 py-2 bg-[#ff4d00] text-black font-bold rounded-xl text-xs uppercase"
                >
                  Back to Safety
                </button>
              </div>
            )}
          </div>
          )}

          {/* Final Launch Footer */}
          {/* Pull-to-refresh indicator */}
          {isRefreshing && (
            <div className="text-center py-3">
              <span className="text-xs font-mono text-[#ff4d00] animate-pulse">🔥 Refreshing feed...</span>
            </div>
          )}

          <footer className="mt-12 pt-8 border-t border-[#1e1e1e] text-xs font-mono text-zinc-500 flex flex-col items-center gap-4 pb-20 md:pb-4">
            {/* Live Stats Bar */}
            <div className="w-full flex justify-center">
              <LiveStats />
            </div>
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#ff4d00]" />
              <span className="text-zinc-400 font-bold">BURNBOARD © 2025</span>
              <span>•</span>
              <span>Built with hate ❤️</span>
              <span>•</span>
              <span className="text-zinc-400 font-semibold">No AI</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-zinc-400">
              <button onClick={() => setCurrentView('privacy')} className="hover:text-white transition-colors">
                Privacy
              </button>
              <button onClick={() => setCurrentView('terms')} className="hover:text-white transition-colors">
                Terms
              </button>
              <button onClick={() => handleNavigate('top')} className="hover:text-white transition-colors">
                Top
              </button>
              <button onClick={() => handleNavigate('battle')} className="hover:text-white transition-colors">
                Battle
              </button>
              <button onClick={() => setCurrentView('world')} className="hover:text-white transition-colors">
                World
              </button>
              <button onClick={() => setCurrentView('trending')} className="hover:text-white transition-colors">
                Trending
              </button>
              <button onClick={() => setCurrentView('challenges')} className="hover:text-white transition-colors">
                Challenges
              </button>
              <button onClick={() => setCurrentView('burnReport')} className="hover:text-white transition-colors">
                Report
              </button>
              <LanguageSwitcher />
              {isInstallable && (
                <button
                  onClick={promptInstall}
                  className="px-3 py-1.5 bg-[#ff4d00] hover:bg-[#ff6622] text-black font-bold text-[11px] rounded-lg transition-all flex items-center gap-1.5"
                >
                  📲 Install App
                </button>
              )}
              <a
                href="https://github.com/burnboard"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                <Github className="w-3.5 h-3.5" />
                <span>Open Source</span>
              </a>
            </div>
            </div>
          </footer>
        </main>

        {/* Right Sidebar */}
        <SidebarRight
          profiles={profiles}
          roasts={roasts}
          onSelectProfile={handleOpenProfile}
          onSelectRoast={handleShareRoast}
        />
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenSubmit={() => setIsSubmitOpen(true)}
      />

      {/* Rate App Dialog (shows after 5 roasts on native) */}
      <RateAppModal
        onShowToast={(text, sub) => addToast(text, sub, 'flame')}
      />

      {/* Konami Code Easter Egg */}
      {showSecretRoast && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111] border-2 border-amber-500 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-[0_0_50px_rgba(245,158,11,0.3)]">
            <div className="text-5xl">🎮🔥</div>
            <h2 className="text-xl font-black text-white uppercase font-mono">Secret Roast Unlocked!</h2>
            <p className="text-base text-amber-300 font-mono italic">"You are too online, go outside."</p>
            <p className="text-xs text-zinc-500 font-mono">— The BURNBOARD Konami Code Easter Egg</p>
            <button onClick={() => setShowSecretRoast(false)} className="px-6 py-2.5 bg-amber-500 text-black font-black font-mono text-xs uppercase rounded-xl hover:bg-amber-400">Touch Grass</button>
          </div>
        </div>
      )}

      {/* Submit Roastee Modal */}
      <SubmitModal
        isOpen={isSubmitOpen}
        onClose={() => setIsSubmitOpen(false)}
        onSubmit={handleCreateProfile}
        onTriggerWarning={(msg, sub) => addToast(msg, sub, 'warning')}
      />

      {/* Viral OG Card Generator Preview Modal */}
      {activeOgShare && (
        <OgCardModal
          roast={activeOgShare.roast}
          profile={activeOgShare.profile}
          onClose={() => setActiveOgShare(null)}
          onShowToast={(text, sub) => addToast(text, sub, 'flame')}
        />
      )}

      {/* Post-Roast Growth / Retention Invite Modal */}
      {inviteModalUsername && (
        <RoastInviteModal
          isOpen={!!inviteModalUsername}
          onClose={() => setInviteModalUsername(null)}
          targetUsername={inviteModalUsername}
          onShowToast={(text, sub) => addToast(text, sub, 'flame')}
        />
      )}

      {/* Login Required Modal */}
      <LoginRequiredModal
        isOpen={!!loginRequiredAction}
        onClose={() => setLoginRequiredAction('')}
        onGoToAuth={() => { setLoginRequiredAction(''); window.location.hash = '#auth'; }}
        action={loginRequiredAction}
      />

      {/* Onboarding Flow */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onOpenSubmit={() => { setShowOnboarding(false); setIsSubmitOpen(true); }}
        onNavigate={(view) => { setShowOnboarding(false); handleNavigate(view as any); }}
        onShowToast={addToast}
        roastCount={userRoastCount}
      />

      {/* Premium Modal */}
      <PremiumModal
        isOpen={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        onShowToast={(text, sub) => addToast(text, sub, 'flame')}
      />

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
