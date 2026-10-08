/**
 * BURN BOARD — Internationalization (i18n)
 * 
 * Modular translation system with English as default fallback.
 * Languages: English (en), Bengali (bn), Hindi (hi)
 * 
 * Usage: import { t } from '@/lib/lang'; then t('key_name')
 * 
 * Architecture: Lightweight localStorage-based. No heavy i18n framework.
 * Missing keys fall back to English. User-generated content is NOT translated.
 */

export const translations = {
  en: {
    // ── Common ──────────────────────────────────────────────
    brand: "BURN BOARD",
    tagline: "No AI. Just Humans Roasting Humans.",
    dismiss: "Dismiss",
    close: "Close",
    back: "Back",
    next: "Next",
    loading: "Loading...",
    error: "Something went wrong",
    retry: "Try Again",
    save: "Save",
    cancel: "Cancel",
    or: "or",
    and: "and",
    see_all: "See All",
    view_all: "View All",
    create: "Create",
    explore: "Explore",
    share: "Share",
    create_title: "What's happening?",
    create_subtitle: "Choose what you want to share with the community.",
    create_offline_draft: "You're offline. Your draft is saved — reconnect to publish.",
    create_offline_photo: "You're offline. Your photo and details are kept — reconnect to publish.",
    discover: "Discover",
    rankings: "Rankings",
    trending: "Trending",
    offline_msg: "You're offline. Go touch grass, then come back to get roasted.",

    // ── Navigation ──────────────────────────────────────────
    nav_home: "Home",
    nav_discover: "Discover",
    nav_battles: "Battles",
    nav_rankings: "Rankings",
    nav_weekly: "Weekly Recap",
    nav_hot_seat: "Hot Seat",
    nav_notifications: "Notifications",
    nav_create_hot_seat: "CREATE HOT SEAT",

    // ── Hero Banner ─────────────────────────────────────────
    hero_headline: "PUT YOURSELF ON THE HOT SEAT",
    hero_subtitle: "Let the internet roast you. No AI. Just real humans with zero filter. Survive the results and share your burn report.",
    hero_step1_title: "Create",
    hero_step1_desc: "Pick a category",
    hero_step2_title: "Get Roasted",
    hero_step2_desc: "Internet does its thing",
    hero_step3_title: "Share",
    hero_step3_desc: "Show the world",
    hero_cta_primary: "PUT ME ON THE HOT SEAT",
    hero_cta_secondary: "SEE WHAT PEOPLE ARE ROASTING",

    // ── Hot Seat ────────────────────────────────────────────
    hot_seat_title: "Hot Seat",
    hot_seat_create: "Put Me On The Hot Seat",
    hot_seat_create_desc: "Let the internet roast you.",
    hot_seat_category: "What do you want roasted?",
    hot_seat_category_desc: "Pick a category for your Hot Seat.",
    hot_seat_title_label: "Title or Prompt",
    hot_seat_title_placeholder: "e.g. Roast my startup idea",
    hot_seat_context_label: "Context (optional)",
    hot_seat_context_placeholder: "e.g. I spent three months building this. Be honest.",
    hot_seat_display_name_label: "Display Name (optional)",
    hot_seat_display_name_placeholder: "Anonymous",
    hot_seat_heat_title: "Choose your Heat Level",
    hot_seat_heat_desc: "How intense should the roasts get?",
    hot_seat_heat_light: "Light",
    hot_seat_heat_light_desc: "Friendly and playful",
    hot_seat_heat_savage: "Savage",
    hot_seat_heat_savage_desc: "More intense but still funny",
    hot_seat_heat_brutal: "Brutal",
    hot_seat_heat_brutal_desc: "Maximum allowed intensity",
    hot_seat_heat_warning: "Brutal does NOT mean harassment, hate speech, or targeted abuse.",
    hot_seat_create_btn: "Create Hot Seat",
    hot_seat_success_title: "You're on the Hot Seat",
    hot_seat_success_desc: "Share your link and watch the roasts roll in.",
    hot_seat_share: "Share",
    hot_seat_copy_link: "Copy Link",
    hot_seat_copied: "Copied!",
    hot_seat_view: "View My Hot Seat",
    hot_seat_create_another: "+ Create another Hot Seat",
    hot_seat_roasts: "roasts",
    hot_seat_is_on: "is on the Hot Seat",
    hot_seat_fire_your_shot: "Fire Your Shot",
    hot_seat_fire_desc: "Keep it funny. Keep it creative. Don't make it personal.",
    hot_seat_write_roast: "Write your roast here...",
    hot_seat_chars_left: "chars left",
    hot_seat_submit: "Fire Your Roast",
    hot_seat_submitted: "✓ Roast Submitted!",
    hot_seat_no_roasts: "No roasts yet",
    hot_seat_no_roasts_desc: "Be the first to fire a shot!",
    hot_seat_add_roast: "ADD YOUR ROAST",
    hot_seat_closed: "Hot Seat Closed",
    hot_seat_closed_desc: "This Hot Seat is no longer accepting roasts.",
    hot_seat_burn_report: "View Burn Report & Share",
    hot_seat_put_yourself: "Put yourself on the Hot Seat →",

    // ── Categories ──────────────────────────────────────────
    cat_photo: "My Photo",
    cat_photo_desc: "Get roasted on your look",
    cat_vibe: "My Vibe",
    cat_vibe_desc: "Roast my energy and aura",
    cat_bio: "My Bio",
    cat_bio_desc: "Destroy my bio text",
    cat_outfit: "My Outfit",
    cat_outfit_desc: "Rate and roast my fit",
    cat_idea: "My Idea",
    cat_idea_desc: "Roast my startup or project idea",
    cat_dating: "My Dating Profile",
    cat_dating_desc: "Crush my dating game",
    cat_music: "My Music Taste",
    cat_music_desc: "Judge my playlists",
    cat_hot_take: "My Hot Take",
    cat_hot_take_desc: "Destroy my controversial opinion",

    // ── Roast ───────────────────────────────────────────────
    roast_submit: "Submit Roast",
    roast_placeholder: "Write your best roast...",
    roast_submit_btn: "Fire Your Roast",
    roast_submitted: "Roast submitted!",
    roast_no_roasts: "No burns yet",
    roast_be_first: "Be the first human to roast",
    roast_more_burns: "more burns",
    roast_see_reaction: "SEE THE REACTION",

    // ── Reactions ───────────────────────────────────────────
    reaction_funny: "Funny",
    reaction_savage: "Savage",
    reaction_fatal: "Fatal",
    reaction_top: "Top",
    reaction_newest: "New",
    reaction_funniest: "😂",
    reaction_fatal_emoji: "💀",

    // ── Burn Score ──────────────────────────────────────────
    burn_score: "Burn Score",
    burn_score_explain: "Based on how the community engaged with your Hot Seat.",
    burn_status_untouched: "Untouched",
    burn_status_singed: "Singed",
    burn_status_scorched: "Scorched",
    burn_status_blazing: "Blazing",
    burn_status_well_done: "Well Done",
    burn_status_cooked: "Absolutely Cooked",

    // ── Burn Report ─────────────────────────────────────────
    burn_report_title: "Burn Report",
    burn_report_subtitle: "Your roast results are in.",
    burn_report_roast_count: "roasts received",
    burn_report_reactions: "reactions",
    burn_report_top_roast: "Top Roast",
    burn_report_funniest: "Funniest Roast",
    burn_report_savage: "Most Savage Roast",
    burn_report_fatal: "Most Fatal Roast",
    burn_report_share: "Share Your Result",
    burn_report_challenge: "Challenge a Friend",

    // ── Share ───────────────────────────────────────────────
    share_card: "Card",
    share_copy: "Copy to clipboard",
    share_copied: "Copied to clipboard",
    share_burn_board: "via BURN BOARD",
    share_i_got_roasted: "I got roasted on BURN BOARD 🔥",
    share_challenge_text: "Think you can survive the Hot Seat?",

    // ── Challenge ───────────────────────────────────────────
    challenge_title: "Challenge a Friend",
    challenge_desc: "Dare someone to survive the Hot Seat.",
    challenge_send: "Send Challenge",
    challenge_accept: "Accept Challenge",
    challenge_complete: "Challenge Complete!",
    challenge_expired: "Challenge Expired",

    // ── Battle ──────────────────────────────────────────────
    battle_title: "Roast Arena",
    battle_subtitle: "Head-to-Head Battle",
    battle_desc: "Who got destroyed harder by real humans? Vote to decide.",
    battle_vote: "Vote",
    battle_voted: "Voted!",
    battle_next: "Next Battle Matchup",
    battle_featured_burns: "Featured Burns",
    battle_no_roasts: "No roasts yet. Be the first to burn this target!",
    battle_total_votes: "TOTAL VOTES",
    battle_vs: "VS",
    battle_join: "JOIN THE ACTION",

    // ── Trending / Discovery ────────────────────────────────
    discover_title: "DISCOVER",
    discover_subtitle: "See what's blowing up on BURN BOARD right now",
    discover_trending_now: "TRENDING NOW",
    discover_hot_seats: "Trending Hot Seats",
    discover_roasts: "Hottest Roasts",
    discover_battles: "Live Roast Battles",
    discover_empty: "THE INTERNET IS QUIET... FOR NOW.",
    discover_empty_desc: "No one has been roasted yet. Be the legend who starts the first fire on BURN BOARD.",
    discover_start_fire: "START THE FIRST FIRE",
    discover_window_now: "Now",
    discover_window_today: "Today",
    discover_window_week: "This Week",
    discover_window_alltime: "All Time",
    discover_type_all: "All",
    discover_type_hotseats: "Hot Seats",
    discover_type_roasts: "Roasts",
    discover_type_battles: "Battles",
    discover_trending: "TRENDING",
    discover_rising: "RISING",
    discover_active_now: "ACTIVE NOW",
    discover_warming: "WARMING UP",

    // ── Leaderboard ─────────────────────────────────────────
    leaderboard_title: "RANKINGS",
    leaderboard_subtitle: "The internet's most roasted content. Updated live.",
    leaderboard_most_cooked: "Most Cooked",
    leaderboard_funniest: "Funniest",
    leaderboard_savage: "Savage",
    leaderboard_fatal: "Fatal",
    leaderboard_battles: "Battles",
    leaderboard_this_week: "This Week",
    leaderboard_last_week: "Last Week",
    leaderboard_all_time: "All Time",
    leaderboard_empty: "YOUR NAME COULD BE HERE",
    leaderboard_empty_desc: "No rankings yet. Create the first Hot Seat and start the competition!",
    leaderboard_burn_score: "burn score",
    leaderboard_close: "close",
    leaderboard_think_next: "Think you can make next week's list?",

    // ── Weekly Recap ────────────────────────────────────────
    weekly_title: "WEEKLY RECAP",
    weekly_subtitle: "The internet has spoken",
    weekly_most_cooked: "Most Cooked",
    weekly_funniest_roast: "Funniest Roast",
    weekly_most_savage: "Most Savage Roast",
    weekly_most_fatal: "Most Fatal Roast",
    weekly_top_battle: "Top Battle",
    weekly_think_next: "Think you can take next week?",
    weekly_put_seat: "PUT ME ON THE HOT SEAT",
    weekly_empty: "NO HIGHLIGHTS YET",
    weekly_empty_desc: "This week hasn't produced any highlights yet. Get roasted and make the list!",
    weekly_last_empty: "NO RECAP AVAILABLE",
    weekly_last_empty_desc: "There was no activity last week. This week is your chance to change that!",

    // ── Notifications ───────────────────────────────────────
    notif_title: "Notifications",
    notif_empty: "NOTHING'S BURNING YET",
    notif_empty_desc: "When new roasts, reactions, or battle results come in, they'll appear here.",
    notif_mark_all: "Mark All Read",
    notif_all_caught: "All caught up!",
    notif_unread: "unread notification",
    notif_unread_plural: "unread notifications",
    notif_create_first: "CREATE YOUR FIRST HOT SEAT",
    notif_view_all: "View All Notifications",

    // ── Onboarding ──────────────────────────────────────────
    onb_first_roast_dropped: "FIRST ROAST DROPPED",
    onb_first_roast_desc: "You just fired your first shot. Welcome to the heat.",
    onb_first_roast_hint: "Keep roasting to climb the leaderboard!",
    onb_discover_more: "DISCOVER MORE HOT SEATS →",
    onb_success_seat: "YOU'RE ON THE HOT SEAT",
    onb_success_seat_desc: "Share it. Let the internet do the rest.",
    onb_success_share: "SHARE",
    onb_success_challenge: "CHALLENGE",
    onb_burn_report_ready: "YOUR BURN REPORT IS READY",
    onb_burn_report_desc: "Based on how the community engaged with your Hot Seat.",
    onb_share_result: "SHARE YOUR RESULT",
    onb_challenge_friend: "CHALLENGE A FRIEND",
    onb_dismiss_hint: "Dismiss hint",
    onb_hint_first_roast: "Tip: Keep roasts clever and playful. The best roasts are specific + funny.",
    onb_hint_share: "Tip: Sharing brings more roasts to your Hot Seat!",
    onb_hint_battle: "Tip: Vote in battles to help find the funniest roasts!",

    // ── Errors ──────────────────────────────────────────────
    err_not_configured: "Supabase Not Configured",
    err_not_configured_desc: "Connect your Supabase project to start roasting.",
    err_not_found: "Hot Seat Not Found",
    err_not_found_desc: "This Hot Seat may have been removed or the link is incorrect.",
    err_submit_failed: "Failed to submit roast",
    err_spam_limit: "Spam limit reached: Maximum 5 roasts per 10 minutes",
    err_duplicate: "Already roasted with this line — be more creative!",
    err_blocked: "Your access has been restricted",
    err_content_rejected: "Content rejected",
    err_generic: "Something went wrong. Please try again.",

    // ── Accessibility ───────────────────────────────────────
    a11y_dismiss: "Dismiss",
    a11y_close: "Close",
    a11y_menu: "Menu",
    a11y_notifications: "Notifications",
    a11y_language: "Switch Language",
    a11y_sort: "Sort",
    a11y_filter: "Filter",
    a11y_upvote: "Upvote",
    a11y_reaction: "React",

    // ── Stats ───────────────────────────────────────────────
    stats_profiles: "profiles",
    stats_roasts: "roasts",
    stats_live: "Live",
    stats_realtime: "Realtime",

    // ── Empty States ────────────────────────────────────────
    empty_no_targets: "No matching targets",
    empty_no_targets_desc: "No profiles found. Submit the first profile to start roasting!",
    empty_search_no_match: "No profiles matching",
    empty_search_put_them: "Put them in the hot seat yourself!",
    empty_you_seen_all: "You've seen all targets — go roast someone!",
    empty_load_more: "Load More Targets",
    empty_no_notifications: "NOTHING'S BURNING YET",
    empty_explore_trending: "EXPLORE TRENDING",

    // ── Leaderboard Types ───────────────────────────────────
    lb_hot_seat: "Hot Seat",
    lb_roast: "Roast",
    lb_battle: "Battle",
    lb_rank: "Rank",
    lb_score: "Score",
    lb_burns: "Burns",
    lb_upvotes: "Upvotes",
    lb_votes: "Votes",
    lb_reactions: "Reactions",
    lb_engagement: "engagement",

    // ── Time ────────────────────────────────────────────────
    time_just_now: "just now",
    time_min_ago: "m ago",
    time_hour_ago: "h ago",
    time_day_ago: "d ago",

    // ── Trust & Safety ─────────────────────────────────────
    safety_report: "Report",
    safety_report_content: "Report this content",
    safety_report_reason: "Why are you reporting this?",
    safety_report_harassment: "Harassment or bullying",
    safety_report_threat: "Threat or violence",
    safety_report_hate: "Hate speech or dehumanizing attacks",
    safety_report_privacy: "Privacy violation (doxxing, personal info)",
    safety_report_sexual: "Sexual or exploitative content",
    safety_report_exploitation: "Exploitation or abuse",
    safety_report_spam: "Spam or fake content",
    safety_report_scam: "Scam or fraud",
    safety_report_other: "Other concern",
    safety_report_context: "Additional context (optional)",
    safety_report_submit: "Submit Report",
    safety_report_thanks: "Thank you for reporting",
    safety_report_thanks_desc: "Our team will review this content. Your report is anonymous.",
    safety_report_duplicate: "You already reported this content recently.",
    safety_report_error: "Failed to submit report. Please try again.",
    safety_content_hidden: "This content is no longer available.",
    safety_content_restricted: "This content has been restricted.",
    safety_appeal: "Appeal this decision",
    safety_appeal_explain: "Why should this decision be reversed?",
    safety_appeal_submit: "Submit Appeal",
    safety_appeal_thanks: "Appeal submitted",
    safety_appeal_thanks_desc: "We'll review your appeal. You'll be notified of the outcome.",
    safety_blocked: "You blocked this user",
    safety_block: "Block user",
    safety_unblock: "Unblock user",

    // ── Product Intelligence ────────────────────────────────
    intel_recommendation: "Recommended for you",
    intel_create_hot_seat: "PUT YOURSELF ON THE HOT SEAT",
    intel_create_hot_seat_desc: "Let the internet roast you. It's fun, we promise.",
    intel_explore_trending: "SEE WHAT'S TRENDING",
    intel_explore_trending_desc: "Check out the hottest roasts right now.",
    intel_start_battle: "ENTER THE BATTLE ARENA",
    intel_start_battle_desc: "Vote on the hardest roasts.",
    intel_share_result: "SHARE YOUR RESULT",
    intel_share_result_desc: "Show the world how you survived.",
    intel_view_burn_report: "VIEW BURN REPORT",
    intel_view_burn_report_desc: "See your roast results and burn score.",
    intel_challenge_friend: "CHALLENGE A FRIEND",
    intel_challenge_friend_desc: "Dare someone to survive the Hot Seat.",
    intel_discover_more: "EXPLORE MORE",
    intel_discover_more_desc: "See what's trending on BURN BOARD.",
    intel_view_leaderboard: "VIEW LEADERBOARD",
    intel_view_leaderboard_desc: "See who's getting roasted the most.",
    intel_ai_assist: "Get AI suggestions",
    intel_ai_assist_desc: "Let AI help you write a better prompt.",
    intel_dismiss: "Not now",
    intel_dismissed: "Got it",

    // ── Global: language, region, notifications, messaging ──
    settings_language: "Language",
    settings_language_desc: "Choose your display language.",
    language_saved: "Language saved",
    region_global: "Global",
    region_country: "Country",
    trending_global: "Global Trending",
    trending_country: "Country Trending",
    scope_global: "Global",
    scope_country: "Country",
    notif_followed: "{user} started following you",
    notif_reacted: "{user} reacted to your post",
    notif_commented: "{user} commented on your post",
    notif_mentioned: "{user} mentioned you",
    notif_invited: "{user} invited you",
    notif_battle_won: "You won the Battle!",
    notif_challenge_done: "Challenge complete!",
    notif_achievement: "You earned an achievement: {name}",
    msg_send: "Send",
    msg_reply: "Reply",
    msg_delete: "Delete",
    msg_copy: "Copy",
    msg_report: "Report",
    msg_block: "Block",
    msg_request: "Message request",
    msg_seen: "Seen",
    msg_typing: "Typing...",
    msg_retry: "Retry",
    err_generic: "Something went wrong.",
    err_network: "Connection lost. Please try again.",
    err_not_found: "Couldn't load this content.",
    empty_default: "Nothing here yet.",
    loading_default: "Loading...",
    profile_follow: "Follow",
    profile_following: "Following",
    profile_message: "Message",
    profile_followers: "Followers",
    profile_following_label: "Following",
    time_yesterday: "Yesterday",
    safety_center: "Safety & Privacy",
    report_title: "Report",
  },

  bn: {
    // ── Common ──────────────────────────────────────────────
    brand: "BURN BOARD",
    tagline: "কোনো AI নয়। মানুষই পচাবে মানুষকে।",
    dismiss: "বন্ধ করুন",
    close: "বন্ধ",
    back: "পেছনে",
    next: "পরবর্তী",
    loading: "লোড হচ্ছে...",
    error: "কিছু ভুল হয়েছে",
    retry: "আবার চেষ্টা করুন",
    save: "সংরক্ষণ",
    cancel: "বাতিল",
    or: "অথবা",
    and: "এবং",
    see_all: "সব দেখুন",
    view_all: "সব দেখুন",
    create: "তৈরি করুন",
    explore: "অনুসন্ধান",
    share: "শেয়ার",
    create_title: "কী হচ্ছে?",
    create_subtitle: "কমিউনিটির সাথে কী শেয়ার করতে চান বেছে নিন।",
    create_offline_draft: "আপনি অফলাইনে। আপনার খসড়া সংরক্ষিত — প্রকাশ করতে পুনরায় সংযোগ করুন।",
    create_offline_photo: "আপনি অফলাইনে। আপনার ছবি ও বিবরণ রাখা আছে — প্রকাশ করতে পুনরায় সংযোগ করুন।",
    discover: "আবিষ্কার",
    rankings: "র‍্যাংকিং",
    trending: "ট্রেন্ডিং",
    offline_msg: "ইন্টারনেট নেই! একটু বাইরে গিয়ে ঘুরে আসুন, তারপর পচানি দেখতে আসুন।",

    // ── Navigation ──────────────────────────────────────────
    nav_home: "হোম",
    nav_discover: "আবিষ্কার",
    nav_battles: "যুদ্ধ",
    nav_rankings: "র‍্যাংকিং",
    nav_weekly: "সাপ্তাহিক",
    nav_hot_seat: "হট সিট",
    nav_notifications: "বিজ্ঞপ্তি",
    nav_create_hot_seat: "হট সিট তৈরি করুন",

    // ── Hero Banner ─────────────────────────────────────────
    hero_headline: "নিজেকে হট সিটে বসান",
    hero_subtitle: "ইন্টারনেটকে আপনাকে পচাতে দিন। কোনো AI নেই। শুধু প্রকৃত মানুষ।",
    hero_step1_title: "তৈরি করুন",
    hero_step1_desc: "একটি ক্যাটাগরি বাছাই করুন",
    hero_step2_title: "পচানি খান",
    hero_step2_desc: "ইন্টারনেট তার কাজ করবে",
    hero_step3_title: "শেয়ার",
    hero_step3_desc: "পুরো বিশ্বকে দেখান",
    hero_cta_primary: "আমাকে হট সিটে বসান",
    hero_cta_secondary: "দেখুন মানুষরা কাকে পচাচ্ছে",

    // ── Hot Seat ────────────────────────────────────────────
    hot_seat_title: "হট সিট",
    hot_seat_create: "আমাকে হট সিটে বসান",
    hot_seat_create_desc: "ইন্টারনেটকে আপনাকে পচাতে দিন।",
    hot_seat_category: "আপনার কী পচাতে চান?",
    hot_seat_category_desc: "আপনার হট সিটের জন্য একটি ক্যাটাগরি বাছাই করুন।",
    hot_seat_title_label: "শিরোনাম বা প্রম্পট",
    hot_seat_title_placeholder: "যেমন আমার স্টার্টআপ আইডিয়া পচাও",
    hot_seat_context_label: "প্রসঙ্গ (ঐচ্ছিক)",
    hot_seat_context_placeholder: "যেমন আমি তিন মাস এটি তৈরি করেছি। সৎ হন।",
    hot_seat_display_name_label: "প্রদর্শন নাম (ঐচ্ছিক)",
    hot_seat_display_name_placeholder: "নামহীন",
    hot_seat_heat_title: "আপনার তাপ স্তর বাছাই করুন",
    hot_seat_heat_desc: "পচানি কতটা তীব্র হোক?",
    hot_seat_heat_light: "হালকা",
    hot_seat_heat_light_desc: "বন্ধুত্বপূর্ণ এবং খেলাচ্ছল",
    hot_seat_heat_savage: "স্যাভেজ",
    hot_seat_heat_savage_desc: "আরও তীব্কিন্তু এখনো মজার",
    hot_seat_heat_brutal: "মারাত্মক",
    hot_seat_heat_brutal_desc: "সর্বোচ্চ অনুমোদিত তীব্রতা",
    hot_seat_heat_warning: "মারাত্মক মানে হয়নি হয়রানি, ঘৃণা বা লক্ষ্যমুখী অত্যাচার।",
    hot_seat_create_btn: "হট সিট তৈরি করুন",
    hot_seat_success_title: "আপনি হট সিটে আছেন",
    hot_seat_success_desc: "আপনার লিঙ্ক শেয়ার করুন এবং পচানি দেখুন।",
    hot_seat_share: "শেয়ার",
    hot_seat_copy_link: "লিঙ্ক কপি",
    hot_seat_copied: "কপি হয়েছে!",
    hot_seat_view: "আমার হট সিট দেখুন",
    hot_seat_create_another: "+ আরেকটি হট সিট তৈরি করুন",
    hot_seat_roasts: "পচানি",
    hot_seat_is_on: "হট সিটে আছেন",
    hot_seat_fire_your_shot: "আপনার শট ফায়ার করুন",
    hot_seat_fire_desc: "মজার রাখুন। সৃজনশীল রাখুন। ব্যক্তিগত করবেন না।",
    hot_seat_write_roast: "আপনার পচানি এখানে লিখুন...",
    hot_seat_chars_left: "অক্ষর বাকি",
    hot_seat_submit: "আপনার পচানি ফায়ার করুন",
    hot_seat_submitted: "✓ পচানি জমা হয়েছে!",
    hot_seat_no_roasts: "এখনো কোনো পচানি নেই",
    hot_seat_no_roasts_desc: "প্রথম শট ফায়ার করুন!",
    hot_seat_add_roast: "পচানি যোগ করুন",
    hot_seat_closed: "হট সিট বন্ধ",
    hot_seat_closed_desc: "এই হট সিট আর পচানি গ্রহণ করছে না।",
    hot_seat_burn_report: "বার্ন রিপোর্ট দেখুন ও শেয়ার করুন",
    hot_seat_put_yourself: "নিজেকে হট সিটে বসান →",

    // ── Categories ──────────────────────────────────────────
    cat_photo: "আমার ছবি",
    cat_photo_desc: "আপনার লুকে পচানি খান",
    cat_vibe: "আমার ভাইব",
    cat_vibe_desc: "আমার এনার্জি এবং অরা পচান",
    cat_bio: "আমার বায়ো",
    cat_bio_desc: "আমার বায়ো টেক্সট ধ্বংস করুন",
    cat_outfit: "আমার পোশাক",
    cat_outfit_desc: "আমার পোশাক রেট করুন এবং পচান",
    cat_idea: "আমার আইডিয়া",
    cat_idea_desc: "আমার স্টার্টআপ বা প্রজেক্ট আইডিয়া পচান",
    cat_dating: "আমার ডেটিং প্রোফাইল",
    cat_dating_desc: "আমার ডেটিং গেম ধ্বংস করুন",
    cat_music: "আমার সংগীত পছন্দ",
    cat_music_desc: "আমার প্লেলিস্ট বিচার করুন",
    cat_hot_take: "আমার হট টেক",
    cat_hot_take_desc: "আমার বিতর্কিত মতামত ধ্বংস করুন",

    // ── Roast ───────────────────────────────────────────────
    roast_submit: "পচানি জমা দিন",
    roast_placeholder: "আপনার সেরা পচানি লিখুন...",
    roast_submit_btn: "পচানি ফায়ার করুন",
    roast_submitted: "পচানি জমা হয়েছে!",
    roast_no_roasts: "এখনো কোনো পচানি নেই",
    roast_be_first: "প্রথম মানুষ হন যিনি পচাবেন",
    roast_more_burns: "আরও পচানি",
    roast_see_reaction: "প্রতিক্রিয়া দেখুন",

    // ── Reactions ───────────────────────────────────────────
    reaction_funny: "মজার",
    reaction_savage: "স্যাভেজ",
    reaction_fatal: "মারাত্মক",
    reaction_top: "শীর্ষ",
    reaction_newest: "নতুন",
    reaction_funniest: "😂",
    reaction_fatal_emoji: "💀",

    // ── Burn Score ──────────────────────────────────────────
    burn_score: "বার্ন স্কোর",
    burn_score_explain: "কমিউনিটি আপনার হট সিটের সাথে কীভাবে জড়িত হয়েছে তার ভিত্তিতে।",
    burn_status_untouched: "অস্পর্শ",
    burn_status_singed: "পোড়া",
    burn_status_scorched: "জ্বলন্ত",
    burn_status_blazing: "আগুন",
    burn_status_well_done: "ভালো হয়েছে",
    burn_status_cooked: "সম্পূর্ণ রান্না",

    // ── Burn Report ─────────────────────────────────────────
    burn_report_title: "বার্ন রিপোর্ট",
    burn_report_subtitle: "আপনার পচানির ফলাফল এসেছে।",
    burn_report_roast_count: "পচানি পেয়েছেন",
    burn_report_reactions: "প্রতিক্রিয়া",
    burn_report_top_roast: "শীর্ষ পচানি",
    burn_report_funniest: "সবচেয়ে মজার পচানি",
    burn_report_savage: "সবচেয়ে স্যাভেজ পচানি",
    burn_report_fatal: "সবচেয়ে মারাত্মক পচানি",
    burn_report_share: "আপনার ফলাফল শেয়ার করুন",
    burn_report_challenge: "একজন বন্ধুকে চ্যালেঞ্জ করুন",

    // ── Share ───────────────────────────────────────────────
    share_card: "কার্ড",
    share_copy: "ক্লিপবোর্ডে কপি",
    share_copied: "ক্লিপবোর্ডে কপি হয়েছে",
    share_burn_board: "BURN BOARD এর মাধ্যমে",
    share_i_got_roasted: "আমি BURN BOARD এ পচানি খেয়েছি 🔥",
    share_challenge_text: "আপনি কি হট সিটে টিকতে পারবেন?",

    // ── Challenge ───────────────────────────────────────────
    challenge_title: "একজন বন্ধুকে চ্যালেঞ্জ করুন",
    challenge_desc: "কাউকে হট সিটে টিকতে সাহস করুন।",
    challenge_send: "চ্যালেঞ্জ পাঠান",
    challenge_accept: "চ্যালেঞ্জ গ্রহণ করুন",
    challenge_complete: "চ্যালেঞ্জ সম্পন্ন!",
    challenge_expired: "চ্যালেঞ্জ মেয়াদোত্তীর্ণ",

    // ── Battle ──────────────────────────────────────────────
    battle_title: "পচানি এরিনা",
    battle_subtitle: "হেড-টু-হেড ব্যাটল",
    battle_desc: "কে বেশি ধ্বংস হয়েছে? ভোট দিন।",
    battle_vote: "ভোট",
    battle_voted: "ভোট দিয়েছেন!",
    battle_next: "পরবর্তী ব্যাটল",
    battle_featured_burns: "বিশেষ পচানি",
    battle_no_roasts: "এখনো কোনো পচানি নেই। প্রথম হন!",
    battle_total_votes: "মোট ভোট",
    battle_vs: "বনাম",
    battle_join: "যোগ দিন",

    // ── Trending / Discovery ────────────────────────────────
    discover_title: "আবিষ্কার",
    discover_subtitle: "BURN BOARD এ এখন কী জ্বলছে দেখুন",
    discover_trending_now: "এখন ট্রেন্ডিং",
    discover_hot_seats: "ট্রেন্ডিং হট সিট",
    discover_roasts: "সবচেয়ে মজার পচানি",
    discover_battles: "লাইভ পচানি যুদ্ধ",
    discover_empty: "ইন্টারনেট চুপ আছে... এখন।",
    discover_empty_desc: "কেউ এখনো পচানি খেয়নি। BURN BOARD এ প্রথম আগুন জ্বালান।",
    discover_start_fire: "প্রথম আগুন জ্বালান",
    discover_window_now: "এখন",
    discover_window_today: "আজ",
    discover_window_week: "এই সপ্তাহ",
    discover_window_alltime: "সর্বকাল",
    discover_type_all: "সব",
    discover_type_hotseats: "হট সিট",
    discover_type_roasts: "পচানি",
    discover_type_battles: "যুদ্ধ",
    discover_trending: "ট্রেন্ডিং",
    discover_rising: "বাড়ছে",
    discover_active_now: "এখন সক্রিয়",
    discover_warming: "উষ্ণ হচ্ছে",

    // ── Leaderboard ─────────────────────────────────────────
    leaderboard_title: "র‍্যাংকিং",
    leaderboard_subtitle: "ইন্টারনেটের সবচেয়ে বেশি পচানি খাওয়া কন্টেন্ট। লাইভ আপডেট।",
    leaderboard_most_cooked: "সবচেয়ে রান্না",
    leaderboard_funniest: "সবচেয়ে মজার",
    leaderboard_savage: "স্যাভেজ",
    leaderboard_fatal: "মারাত্মক",
    leaderboard_battles: "যুদ্ধ",
    leaderboard_this_week: "এই সপ্তাহ",
    leaderboard_last_week: "গত সপ্তাহ",
    leaderboard_all_time: "সর্বকাল",
    leaderboard_empty: "আপনার নাম এখানে থাকতে পারত",
    leaderboard_empty_desc: "এখনো কোনো র‍্যাংকিং নেই। প্রথম হট সিট তৈরি করুন!",
    leaderboard_burn_score: "বার্ন স্কোর",
    leaderboard_close: "কাছাকাছি",
    leaderboard_think_next: "আপনি কি পরের সপ্তাহের তালিকায় থাকতে পারবেন?",

    // ── Weekly Recap ────────────────────────────────────────
    weekly_title: "সাপ্তাহিক সারসংক্ষেপ",
    weekly_subtitle: "ইন্টারনেট কথা বলেছে",
    weekly_most_cooked: "সবচেয়ে রান্না",
    weekly_funniest_roast: "সবচেয়ে মজার পচানি",
    weekly_most_savage: "সবচেয়ে স্যাভেজ পচানি",
    weekly_most_fatal: "সবচেয়ে মারাত্মক পচানি",
    weekly_top_battle: "শীর্ষ যুদ্ধ",
    weekly_think_next: "আপনি কি পরের সপ্তাহে টিকতে পারবেন?",
    weekly_put_seat: "আমাকে হট সিটে বসান",
    weekly_empty: "এখনো কোনো হাইলাইট নেই",
    weekly_empty_desc: "এই সপ্তাহে এখনো কোনো হাইলাইট নেই। পচানি খান এবং তালিকায় আসুন!",
    weekly_last_empty: "কোনো সারসংক্ষেপ নেই",
    weekly_last_empty_desc: "গত সপ্তাহে কোনো কার্যকলাপ ছিল না।",

    // ── Notifications ───────────────────────────────────────
    notif_title: "বিজ্ঞপ্তি",
    notif_empty: "এখনো কিছু জ্বলছে না",
    notif_empty_desc: "নতুন পচানি, প্রতিক্রিয়া বা যুদ্ধের ফলাফল এলে এখানে দেখা যাবে।",
    notif_mark_all: "সব পঠিত হিসেবে চিহ্নিত করুন",
    notif_all_caught: "সব দেখা হয়ে গেছে!",
    notif_unread: "অপঠিত বিজ্ঞপ্তি",
    notif_unread_plural: "অপঠিত বিজ্ঞপ্তি",
    notif_create_first: "প্রথম হট সিট তৈরি করুন",
    notif_view_all: "সব বিজ্ঞপ্তি দেখুন",

    // ── Onboarding ──────────────────────────────────────────
    onb_first_roast_dropped: "প্রথম পচানি ফায়ার!",
    onb_first_roast_desc: "আপনি প্রথম শট ফায়ার করেছেন। তাপে স্বাগতম।",
    onb_first_roast_hint: "টিপ: পচানি চতুর এবং মজার রাখুন।",
    onb_discover_more: "আরও হট সিট আবিষ্কার করুন →",
    onb_success_seat: "আপনি হট সিটে আছেন",
    onb_success_seat_desc: "শেয়ার করুন। ইন্টারনেট বাকি কাজ করবে।",
    onb_success_share: "শেয়ার",
    onb_success_challenge: "চ্যালেঞ্জ",
    onb_burn_report_ready: "আপনার বার্ন রিপোর্ট প্রস্তুত",
    onb_burn_report_desc: "কমিউনিটি আপনার হট সিটের সাথে কীভাবে জড়িত হয়েছে।",
    onb_share_result: "ফলাফল শেয়ার করুন",
    onb_challenge_friend: "একজন বন্ধুকে চ্যালেঞ্জ করুন",
    onb_dismiss_hint: "টিপ বন্ধ করুন",
    onb_hint_first_roast: "টিপ: পচানি চতুর এবং মজার রাখুন। সেরা পচানি নির্দিষ্ট + মজার।",
    onb_hint_share: "টিপ: শেয়ার করলে আপনার হট সিটে আরও পচানি আসে!",
    onb_hint_battle: "টিপ: যুদ্ধে ভোট দিন সবচেয়ে মজার পচানি খুঁজে বের করতে!",

    // ── Errors ──────────────────────────────────────────────
    err_not_configured: "Supabase কনফিগার করা হয়নি",
    err_not_configured_desc: "পচানি শুরু করতে আপনার Supabase প্রজেক্ট সংযুক্ত করুন।",
    err_not_found: "হট সিট পাওয়া যায়নি",
    err_not_found_desc: "এই হট সিট সরিয়ে ফেলা হতে পারে বা লিঙ্ক ভুল।",
    err_submit_failed: "পচানি জমা দিতে ব্যর্থ",
    err_spam_limit: "স্প্যাম সীমা পৌঁছেছে: ১০ মিনিটে সর্বোচ্চ ৫টি পচানি",
    err_duplicate: "এই লাইন দিয়ে ইতিমধ্যে পচানি হয়েছে — আরও সৃজনশীল হন!",
    err_blocked: "আপনার অ্যাক্সেস সীমাবদ্ধ করা হয়েছে",
    err_content_rejected: "কন্টেন্ট প্রত্যাখ্যাত",
    err_generic: "কিছু ভুল হয়েছে। আবার চেষ্টা করুন।",

    // ── Accessibility ───────────────────────────────────────
    a11y_dismiss: "বন্ধ করুন",
    a11y_close: "বন্ধ",
    a11y_menu: "মেনু",
    a11y_notifications: "বিজ্ঞপ্তি",
    a11y_language: "ভাষা পরিবর্তন",
    a11y_sort: "সাজান",
    a11y_filter: "ফিল্টার",
    a11y_upvote: "আগুন দিন",
    a11y_reaction: "প্রতিক্রিয়া",

    // ── Stats ───────────────────────────────────────────────
    stats_profiles: "প্রোফাইল",
    stats_roasts: "পচানি",
    stats_live: "লাইভ",
    stats_realtime: "রিয়েলটাইম",

    // ── Empty States ────────────────────────────────────────
    empty_no_targets: "কোনো টার্গেট পাওয়া যায়নি",
    empty_no_targets_desc: "প্রথম প্রোফাইল জমা দিন পচানি শুরু করতে!",
    empty_search_no_match: "কোনো মিল পাওয়া যায়নি",
    empty_search_put_them: "নিজেই হট সিটে বসান!",
    empty_you_seen_all: "সব দেখা হয়ে গেছে — এখন পচান!",
    empty_load_more: "আরও টার্গেট লোড করুন",
    empty_no_notifications: "এখনো কিছু জ্বলছে না",
    empty_explore_trending: "ট্রেন্ডিং দেখুন",

    // ── Leaderboard Types ───────────────────────────────────
    lb_hot_seat: "হট সিট",
    lb_roast: "পচানি",
    lb_battle: "যুদ্ধ",
    lb_rank: "র‍্যাংক",
    lb_score: "স্কোর",
    lb_burns: "পচানি",
    lb_upvotes: "আগুন",
    lb_votes: "ভোট",
    lb_reactions: "প্রতিক্রিয়া",
    lb_engagement: "সম্পৃক্তি",

    // ── Time ────────────────────────────────────────────────
    time_just_now: "এইমাত্র",
    time_min_ago: "মিনিট আগে",
    time_hour_ago: "ঘণ্টা আগে",
    time_day_ago: "দিন আগে",

    // ── Global: language, region, notifications, messaging ──
    settings_language: "ভাষা",
    settings_language_desc: "আপনার প্রদর্শন ভাষা বেছে নিন।",
    language_saved: "ভাষা সংরক্ষিত হয়েছে",
    region_global: "বৈশ্বিক",
    region_country: "দেশ",
    trending_global: "বৈশ্বিক ট্রেন্ডিং",
    trending_country: "দেশের ট্রেন্ডিং",
    scope_global: "বৈশ্বিক",
    scope_country: "দেশ",
    notif_followed: "{user} আপনাকে অনুসরণ করা শুরু করেছে",
    notif_reacted: "{user} আপনার পোস্টে প্রতিক্রিয়া দিয়েছে",
    notif_commented: "{user} আপনার পোস্টে মন্তব্য করেছে",
    notif_mentioned: "{user} আপনাকে উল্লেখ করেছে",
    notif_invited: "{user} আপনাকে আমন্ত্রণ জানিয়েছে",
    notif_battle_won: "আপনি ব্যাটল জিতেছেন!",
    notif_challenge_done: "চ্যালেঞ্জ সম্পন্ন!",
    notif_achievement: "আপনি একটি অর্জন পেয়েছেন: {name}",
    msg_send: "পাঠান",
    msg_reply: "উত্তর",
    msg_delete: "মুছুন",
    msg_copy: "কপি",
    msg_report: "রিপোর্ট",
    msg_block: "ব্লক",
    msg_request: "মেসেজ অনুরোধ",
    msg_seen: "দেখা হয়েছে",
    msg_typing: "লিখছে...",
    msg_retry: "আবার চেষ্টা",
    err_generic: "কিছু ভুল হয়েছে।",
    err_network: "সংযোগ বিচ্ছিন্ন। আবার চেষ্টা করুন।",
    err_not_found: "এই কনটেন্ট লোড করা যায়নি।",
    empty_default: "এখনো কিছু নেই।",
    loading_default: "লোড হচ্ছে...",
    profile_follow: "অনুসরণ",
    profile_following: "অনুসরণ করছেন",
    profile_message: "মেসেজ",
    profile_followers: "অনুসারী",
    profile_following_label: "অনুসরণ",
    time_yesterday: "গতকাল",
    safety_center: "নিরাপত্তা ও গোপনীয়তা",
    report_title: "রিপোর্ট",
  },

  hi: {
    // ── Common ──────────────────────────────────────────────
    brand: "BURN BOARD",
    tagline: "कोई AI नहीं। केवल इंसान इंसान को रोस्ट करेंगे।",
    dismiss: "बंद करें",
    close: "बंद",
    back: "वापस",
    next: "अगला",
    loading: "लोड हो रहा है...",
    error: "कुछ गलत हो गया",
    retry: "फिर से कोशिश करें",
    save: "सहेजें",
    cancel: "रद्द",
    or: "या",
    and: "और",
    see_all: "सब देखें",
    view_all: "सब देखें",
    create: "बनाएं",
    explore: "खोजें",
    share: "शेयर",
    create_title: "क्या हो रहा है?",
    create_subtitle: "समुदाय के साथ क्या साझा करना चाहते हैं चुनें।",
    create_offline_draft: "आप ऑफ़लाइन हैं। आपका मसौदा सहेजा गया — प्रकाशित करने के लिए पुनः कनेक्ट करें।",
    create_offline_photo: "आप ऑफ़लाइन हैं। आपकी फ़ोटो और विवरण सुरक्षित हैं — प्रकाशित करने के लिए पुनः कनेक्ट करें।",
    discover: "खोजें",
    rankings: "रैंकिंग",
    trending: "ट्रेंडिंग",
    offline_msg: "आप ऑफलाइन हैं। बाहर जाकर हवा खाइए, फिर रोस्ट करने आइए।",

    // ── Navigation ──────────────────────────────────────────
    nav_home: "होम",
    nav_discover: "खोजें",
    nav_battles: "युद्ध",
    nav_rankings: "रैंकिंग",
    nav_weekly: "साप्ताहिक",
    nav_hot_seat: "हॉट सीट",
    nav_notifications: "सूचनाएं",
    nav_create_hot_seat: "हॉट सीट बनाएं",

    // ── Hero Banner ─────────────────────────────────────────
    hero_headline: "खुद को हॉट सीट पर बैठाएं",
    hero_subtitle: "इंटरनेट को अपना रोस्ट करने दें। कोई AI नहीं। बस असली इंसान।",
    hero_step1_title: "बनाएं",
    hero_step1_desc: "एक कैटेगरी चुनें",
    hero_step2_title: "रोस्ट खाएं",
    hero_step2_desc: "इंटरनेट अपना काम करेगा",
    hero_step3_title: "शेयर",
    hero_step3_desc: "पूरी दुनिया को दिखाएं",
    hero_cta_primary: "मुझे हॉट सीट पर बैठाएं",
    hero_cta_secondary: "देखें लोग किसका रोस्ट कर रहे हैं",

    // ── Hot Seat ────────────────────────────────────────────
    hot_seat_title: "हॉट सीट",
    hot_seat_create: "मुझे हॉट सीट पर बैठाएं",
    hot_seat_create_desc: "इंटरनेट को अपना रोस्ट करने दें।",
    hot_seat_category: "आपका क्या रोस्ट हो?",
    hot_seat_category_desc: "अपनी हॉट सीट के लिए कैटेगरी चुनें।",
    hot_seat_title_label: "शीर्षक या प्रॉम्प्ट",
    hot_seat_title_placeholder: "जैसे मेरा स्टार्टअप आइडिया रोस्ट करो",
    hot_seat_context_label: "संदर्भ (वैकल्पिक)",
    hot_seat_context_placeholder: "जैसे मैंने तीन महीने इसे बनाया। ईमानदार रहें।",
    hot_seat_display_name_label: "प्रदर्शन नाम (वैकल्पिक)",
    hot_seat_display_name_placeholder: "अनाम",
    hot_seat_heat_title: "अपना हीट लेवल चुनें",
    hot_seat_heat_desc: "रोस्ट कितने तीव्र हों?",
    hot_seat_heat_light: "हल्का",
    hot_seat_heat_light_desc: "दोस्ताना और मज़ेदार",
    hot_seat_heat_savage: "सैवेज",
    hot_seat_heat_savage_desc: "थोड़ा तीव्र लेकिन अभी भी मज़ेदार",
    hot_seat_heat_brutal: "खतरनाक",
    hot_seat_heat_brutal_desc: "अधिकतम अनुमत तीव्रता",
    hot_seat_heat_warning: "खतरनाक का मतलब उत्पीड़न, नफ़रत या निशाना बनाना नहीं है।",
    hot_seat_create_btn: "हॉट सीट बनाएं",
    hot_seat_success_title: "आप हॉट सीट पर हैं",
    hot_seat_success_desc: "अपना लिंक शेयर करें और रोस्ट देखें।",
    hot_seat_share: "शेयर",
    hot_seat_copy_link: "लिंक कॉपी",
    hot_seat_copied: "कॉपी हो गया!",
    hot_seat_view: "मेरी हॉट सीट देखें",
    hot_seat_create_another: "+ एक और हॉट सीट बनाएं",
    hot_seat_roasts: "रोस्ट",
    hot_seat_is_on: "हॉट सीट पर हैं",
    hot_seat_fire_your_shot: "अपना शॉट फायर करें",
    hot_seat_fire_desc: "मज़ेदार रखें। क्रिएटिव रखें। व्यक्तिगत न बनाएं।",
    hot_seat_write_roast: "यहां अपना रोस्ट लिखें...",
    hot_seat_chars_left: "अक्षर बाकी",
    hot_seat_submit: "अपना रोस्ट फायर करें",
    hot_seat_submitted: "✓ रोस्ट सबमिट हो गया!",
    hot_seat_no_roasts: "अभी कोई रोस्ट नहीं",
    hot_seat_no_roasts_desc: "पहला शॉट फायर करें!",
    hot_seat_add_roast: "रोस्ट डालें",
    hot_seat_closed: "हॉट सीट बंद",
    hot_seat_closed_desc: "यह हॉट सीट अब रोस्ट स्वीकार नहीं कर रही।",
    hot_seat_burn_report: "बर्न रिपोर्ट देखें और शेयर करें",
    hot_seat_put_yourself: "खुद को हॉट सीट पर बैठाएं →",

    // ── Categories ──────────────────────────────────────────
    cat_photo: "मेरी फोटो",
    cat_photo_desc: "अपने लुक पर रोस्ट पाएं",
    cat_vibe: "मेरा वाइब",
    cat_vibe_desc: "मेरी एनर्जी और औरा रोस्ट करें",
    cat_bio: "मेरा बायो",
    cat_bio_desc: "मेरा बायो टेक्स्ट नष्ट करें",
    cat_outfit: "मेरा पहनावा",
    cat_outfit_desc: "मेरा फिट रेट करें और रोस्ट करें",
    cat_idea: "मेरा आइडिया",
    cat_idea_desc: "मेरा स्टार्टअप या प्रोजेक्ट आइडिया रोस्ट करें",
    cat_dating: "मेरी डेटिंग प्रोफाइल",
    cat_dating_desc: "मेरी डेटिंग गेम कुचलें",
    cat_music: "मेरा म्यूजिक पसंद",
    cat_music_desc: "मेरी प्लेलिस्ट जज करें",
    cat_hot_take: "मेरा हॉट टेक",
    cat_hot_take_desc: "मेरा विवादास्पद राय नष्ट करें",

    // ── Roast ───────────────────────────────────────────────
    roast_submit: "रोस्ट सबमिट करें",
    roast_placeholder: "अपना बेस्ट रोस्ट लिखें...",
    roast_submit_btn: "रोस्ट फायर करें",
    roast_submitted: "रोस्ट सबमिट हो गया!",
    roast_no_roasts: "अभी कोई रोस्ट नहीं",
    roast_be_first: "पहले इंसान बनें जो रोस्ट करेगा",
    roast_more_burns: "और रोस्ट",
    roast_see_reaction: "प्रतिक्रिया देखें",

    // ── Reactions ───────────────────────────────────────────
    reaction_funny: "मज़ेदार",
    reaction_savage: "सैवेज",
    reaction_fatal: "खतरनाक",
    reaction_top: "टॉप",
    reaction_newest: "नया",
    reaction_funniest: "😂",
    reaction_fatal_emoji: "💀",

    // ── Burn Score ──────────────────────────────────────────
    burn_score: "बर्न स्कोर",
    burn_score_explain: "कम्युनिटी ने आपकी हॉट सीट के साथ कैसे जुड़ाव किया।",
    burn_status_untouched: "अछूत",
    burn_status_singed: "जला हुआ",
    burn_status_scorched: "धधकता",
    burn_status_blazing: "आग",
    burn_status_well_done: "अच्छा हुआ",
    burn_status_cooked: "पूरी तरह पका हुआ",

    // ── Burn Report ─────────────────────────────────────────
    burn_report_title: "बर्न रिपोर्ट",
    burn_report_subtitle: "आपके रोस्ट के नतीजे आ गए।",
    burn_report_roast_count: "रोस्ट मिले",
    burn_report_reactions: "प्रतिक्रियाएं",
    burn_report_top_roast: "टॉप रोस्ट",
    burn_report_funniest: "सबसे मज़ेदार रोस्ट",
    burn_report_savage: "सबसे सैवेज रोस्ट",
    burn_report_fatal: "सबसे खतरनाक रोस्ट",
    burn_report_share: "अपना नतीजा शेयर करें",
    burn_report_challenge: "दोस्त को चैलेंज करें",

    // ── Share ───────────────────────────────────────────────
    share_card: "कार्ड",
    share_copy: "क्लिपबोर्ड में कॉपी",
    share_copied: "क्लिपबोर्ड में कॉपी हो गया",
    share_burn_board: "BURN BOARD के माध्यम से",
    share_i_got_roasted: "मैंने BURN BOARD पर रोस्ट खाया 🔥",
    share_challenge_text: "क्या आप हॉट सीट पर टिक सकते हैं?",

    // ── Challenge ───────────────────────────────────────────
    challenge_title: "दोस्त को चैलेंज करें",
    challenge_desc: "किसी को हॉट सीट पर टिकने की हिम्मत करें।",
    challenge_send: "चैलेंज भेजें",
    challenge_accept: "चैलेंज स्वीकारें",
    challenge_complete: "चैलेंज पूरा!",
    challenge_expired: "चैलेंज की समय सीमा बीत गई",

    // ── Battle ──────────────────────────────────────────────
    battle_title: "रोस्ट एरीना",
    battle_subtitle: "हेड-टू-हेड बैटल",
    battle_desc: "किसका रोस्ट ज़्यादा हुआ? वोट करें।",
    battle_vote: "वोट",
    battle_voted: "वोट हो गया!",
    battle_next: "अगली बैटल",
    battle_featured_burns: "खास रोस्ट",
    battle_no_roasts: "अभी कोई रोस्ट नहीं। पहले बनें!",
    battle_total_votes: "कुल वोट",
    battle_vs: "बनाम",
    battle_join: "शामिल हों",

    // ── Trending / Discovery ────────────────────────────────
    discover_title: "खोजें",
    discover_subtitle: "BURN BOARD पर अभी क्या चल रहा है",
    discover_trending_now: "अभी ट्रेंडिंग",
    discover_hot_seats: "ट्रेंडिंग हॉट सीट",
    discover_roasts: "सबसे मज़ेदार रोस्ट",
    discover_battles: "लाइव रोस्ट बैटल",
    discover_empty: "इंटरनेट चुप है... अभी।",
    discover_empty_desc: "किसी का रोस्ट अभी नहीं हुआ। BURN BOARD पर पहली आग लगाएं।",
    discover_start_fire: "पहली आग लगाएं",
    discover_window_now: "अभी",
    discover_window_today: "आज",
    discover_window_week: "इस हफ्ते",
    discover_window_alltime: "सदैव",
    discover_type_all: "सब",
    discover_type_hotseats: "हॉट सीट",
    discover_type_roasts: "रोस्ट",
    discover_type_battles: "बैटल",
    discover_trending: "ट्रेंडिंग",
    discover_rising: "बढ़ रहा",
    discover_active_now: "अभी सक्रिय",
    discover_warming: "गर्म हो रहा",

    // ── Leaderboard ─────────────────────────────────────────
    leaderboard_title: "रैंकिंग",
    leaderboard_subtitle: "इंटरनेट का सबसे रोस्टेड कंटेंट। लाइव अपडेट।",
    leaderboard_most_cooked: "सबसे पका हुआ",
    leaderboard_funniest: "सबसे मज़ेदार",
    leaderboard_savage: "सैवेज",
    leaderboard_fatal: "खतरनाक",
    leaderboard_battles: "बैटल",
    leaderboard_this_week: "इस हफ्ते",
    leaderboard_last_week: "पिछले हफ्ते",
    leaderboard_all_time: "सदैव",
    leaderboard_empty: "आपका नाम यहां हो सकता है",
    leaderboard_empty_desc: "अभी कोई रैंकिंग नहीं। पहली हॉट सीट बनाएं!",
    leaderboard_burn_score: "बर्न स्कोर",
    leaderboard_close: "करीबी",
    leaderboard_think_next: "क्या आप अगले हफ्ते की लिस्ट में हो सकते हैं?",

    // ── Weekly Recap ────────────────────────────────────────
    weekly_title: "साप्ताहिक रीकैप",
    weekly_subtitle: "इंटरनेट ने बोल दिया",
    weekly_most_cooked: "सबसे पका हुआ",
    weekly_funniest_roast: "सबसे मज़ेदार रोस्ट",
    weekly_most_savage: "सबसे सैवेज रोस्ट",
    weekly_most_fatal: "सबसे खतरनाक रोस्ट",
    weekly_top_battle: "टॉप बैटल",
    weekly_think_next: "क्या आप अगले हफ्ते टिक सकते हैं?",
    weekly_put_seat: "मुझे हॉट सीट पर बैठाएं",
    weekly_empty: "अभी कोई हाइलाइट नहीं",
    weekly_empty_desc: "इस हफ्ते अभी कोई हाइलाइट नहीं। रोस्ट खाएं और लिस्ट में आएं!",
    weekly_last_empty: "कोई रीकैप उपलब्ध नहीं",
    weekly_last_empty_desc: "पिछले हफ्ते कोई एक्टिविटी नहीं थी।",

    // ── Notifications ───────────────────────────────────────
    notif_title: "सूचनाएं",
    notif_empty: "अभी कुछ नहीं जल रहा",
    notif_empty_desc: "नए रोस्ट, प्रतिक्रिया या बैटल रिजल्ट आने पर यहां दिखेगा।",
    notif_mark_all: "सब पढ़ा हुआ चिह्नित करें",
    notif_all_caught: "सब देख लिया!",
    notif_unread: "अपठित सूचना",
    notif_unread_plural: "अपठित सूचनाएं",
    notif_create_first: "पहली हॉट सीट बनाएं",
    notif_view_all: "सभी सूचनाएं देखें",

    // ── Onboarding ──────────────────────────────────────────
    onb_first_roast_dropped: "पहला रोस्ट फायर!",
    onb_first_roast_desc: "आपने पहला शॉट फायर किया। ताप में स्वागत है।",
    onb_first_roast_hint: "टिप: रोस्ट को चतुर और मज़ेदार रखें।",
    onb_discover_more: "और हॉट सीट खोजें →",
    onb_success_seat: "आप हॉट सीट पर हैं",
    onb_success_seat_desc: "शेयर करें। इंटरनेट बाकी काम करेगा।",
    onb_success_share: "शेयर",
    onb_success_challenge: "चैलेंज",
    onb_burn_report_ready: "आपकी बर्न रिपोर्ट तैयार",
    onb_burn_report_desc: "कम्युनिटी ने आपकी हॉट सीट के साथ कैसे जुड़ाव किया।",
    onb_share_result: "नतीजा शेयर करें",
    onb_challenge_friend: "दोस्त को चैलेंज करें",
    onb_dismiss_hint: "टिप बंद करें",
    onb_hint_first_roast: "टिप: रोस्ट को चतुर और मज़ेदार रखें। बेस्ट रोस्ट निश्चित + मज़ेदार होते हैं।",
    onb_hint_share: "टिप: शेयर करने से आपकी हॉट सीट पर और रोस्ट आते हैं!",
    onb_hint_battle: "टिप: बैटल में वोट करें सबसे मज़ेदार रोस्ट खोजने के लिए!",

    // ── Errors ──────────────────────────────────────────────
    err_not_configured: "Supabase कॉन्फ़िगर नहीं है",
    err_not_configured_desc: "रोस्ट शुरू करने के लिए अपना Supabase प्रोजेक्ट जोड़ें।",
    err_not_found: "हॉट सीट नहीं मिली",
    err_not_found_desc: "यह हॉट सीट हटा दी गई हो सकती है या लिंक गलत है।",
    err_submit_failed: "रोस्ट सबमिट करने में विफल",
    err_spam_limit: "स्पैम सीमा पूरी: 10 मिनट में अधिकतम 5 रोस्ट",
    err_duplicate: "इस लाइन से पहले ही रोस्ट हो चुका है — और क्रिएटिव बनें!",
    err_blocked: "आपकी पहुंच प्रतिबंधित है",
    err_content_rejected: "कंटेंट अस्वीकृत",
    err_generic: "कुछ गलत हो गया। फिर से कोशिश करें।",

    // ── Accessibility ───────────────────────────────────────
    a11y_dismiss: "बंद करें",
    a11y_close: "बंद",
    a11y_menu: "मेनू",
    a11y_notifications: "सूचनाएं",
    a11y_language: "भाषा बदलें",
    a11y_sort: "क्रमबद्ध",
    a11y_filter: "फ़िल्टर",
    a11y_upvote: "आग लगाओ",
    a11y_reaction: "प्रतिक्रिया",

    // ── Stats ───────────────────────────────────────────────
    stats_profiles: "प्रोफाइल",
    stats_roasts: "रोस्ट",
    stats_live: "लाइव",
    stats_realtime: "रियलटाइम",

    // ── Empty States ────────────────────────────────────────
    empty_no_targets: "कोई टारगेट नहीं मिला",
    empty_no_targets_desc: "पहली प्रोफाइल सबमिट करें रोस्ट शुरू करने के लिए!",
    empty_search_no_match: "कोई मिल नहीं मिला",
    empty_search_put_them: "खुद हॉट सीट पर बैठाएं!",
    empty_you_seen_all: "सब देखा जा चुका — अब रोस्ट करें!",
    empty_load_more: "और टारगेट लोड करें",
    empty_no_notifications: "अभी कुछ नहीं जल रहा",
    empty_explore_trending: "ट्रेंडिंग देखें",

    // ── Leaderboard Types ───────────────────────────────────
    lb_hot_seat: "हॉट सीट",
    lb_roast: "रोस्ट",
    lb_battle: "बैटल",
    lb_rank: "रैंक",
    lb_score: "स्कोर",
    lb_burns: "रोस्ट",
    lb_upvotes: "आग",
    lb_votes: "वोट",
    lb_reactions: "प्रतिक्रियाएं",
    lb_engagement: "जुड़ाव",

    // ── Time ────────────────────────────────────────────────
    time_just_now: "अभी",
    time_min_ago: "मिनट पहले",
    time_hour_ago: "घंटा पहले",
    time_day_ago: "दिन पहले",
  },

  es: {
    brand: "BURNBOARD",
    tagline: "Sin IA. Solo humanos quemando humanos.",
    dismiss: "Descartar",
    close: "Cerrar",
    back: "Atrás",
    loading: "Cargando...",
    error: "Algo salió mal",
    retry: "Reintentar",
    save: "Guardar",
    cancel: "Cancelar",
    see_all: "Ver todo",
    explore: "Explorar",
    share: "Compartir",
    create_title: "¿Qué está pasando?",
    create_subtitle: "Elige lo que quieres compartir con la comunidad.",
    create_offline_draft: "Estás sin conexión. Tu borrador está guardado — conéctate para publicar.",
    create_offline_photo: "Estás sin conexión. Tu foto y los detalles se conservan — conéctate para publicar.",
    discover: "Descubrir",
    trending: "Tendencias",
    nav_home: "Inicio",
    nav_discover: "Descubrir",
    nav_battles: "Batallas",
    nav_rankings: "Clasificación",
    nav_notifications: "Notificaciones",
    time_just_now: "ahora mismo",
    time_min_ago: "min",
    time_hour_ago: "h",
    time_day_ago: "d",
    settings_language: "Idioma",
    settings_language_desc: "Elige tu idioma de visualización.",
    language_saved: "Idioma guardado",
    region_global: "Global",
    region_country: "País",
    trending_global: "Tendencias globales",
    trending_country: "Tendencias del país",
    scope_global: "Global",
    scope_country: "País",
    notif_followed: "{user} empezó a seguirte",
    notif_reacted: "{user} reaccionó a tu publicación",
    notif_commented: "{user} comentó en tu publicación",
    notif_mentioned: "{user} te mencionó",
    notif_invited: "{user} te invitó",
    notif_battle_won: "¡Ganaste la batalla!",
    notif_challenge_done: "¡Desafío completado!",
    notif_achievement: "Ganaste un logro: {name}",
    msg_send: "Enviar",
    msg_reply: "Responder",
    msg_delete: "Eliminar",
    msg_copy: "Copiar",
    msg_report: "Denunciar",
    msg_block: "Bloquear",
    msg_request: "Solicitud de mensaje",
    msg_seen: "Visto",
    msg_typing: "Escribiendo...",
    msg_retry: "Reintentar",
    err_generic: "Algo salió mal.",
    err_network: "Sin conexión. Inténtalo de nuevo.",
    err_not_found: "No se pudo cargar este contenido.",
    empty_default: "Nada aquí todavía.",
    loading_default: "Cargando...",
    profile_follow: "Seguir",
    profile_following: "Siguiendo",
    profile_message: "Mensaje",
    profile_followers: "Seguidores",
    profile_following_label: "Seguidos",
    time_yesterday: "Ayer",
    safety_center: "Seguridad y privacidad",
    report_title: "Denunciar",
  },

  fr: {
    brand: "BURNBOARD",
    tagline: "Sans IA. Juste des humains qui se clashent.",
    dismiss: "Ignorer",
    close: "Fermer",
    back: "Retour",
    loading: "Chargement...",
    error: "Quelque chose a mal tourné",
    retry: "Réessayer",
    save: "Enregistrer",
    cancel: "Annuler",
    see_all: "Tout voir",
    explore: "Explorer",
    share: "Partager",
    create_title: "Quoi de neuf ?",
    create_subtitle: "Choisissez ce que vous voulez partager avec la communauté.",
    create_offline_draft: "Vous êtes hors ligne. Votre brouillon est enregistré — reconnectez-vous pour publier.",
    create_offline_photo: "Vous êtes hors ligne. Votre photo et vos détails sont conservés — reconnectez-vous pour publier.",
    discover: "Découvrir",
    trending: "Tendances",
    nav_home: "Accueil",
    nav_discover: "Découvrir",
    nav_battles: "Batailles",
    nav_rankings: "Classements",
    nav_notifications: "Notifications",
    time_just_now: "à l'instant",
    time_min_ago: "min",
    time_hour_ago: "h",
    time_day_ago: "j",
    settings_language: "Langue",
    settings_language_desc: "Choisissez votre langue d'affichage.",
    language_saved: "Langue enregistrée",
    region_global: "Mondial",
    region_country: "Pays",
    trending_global: "Tendances mondiales",
    trending_country: "Tendances du pays",
    scope_global: "Mondial",
    scope_country: "Pays",
    notif_followed: "{user} a commencé à vous suivre",
    notif_reacted: "{user} a réagi à votre publication",
    notif_commented: "{user} a commenté votre publication",
    notif_mentioned: "{user} vous a mentionné",
    notif_invited: "{user} vous a invité",
    notif_battle_won: "Vous avez gagné la bataille !",
    notif_challenge_done: "Défi terminé !",
    notif_achievement: "Vous avez gagné un succès : {name}",
    msg_send: "Envoyer",
    msg_reply: "Répondre",
    msg_delete: "Supprimer",
    msg_copy: "Copier",
    msg_report: "Signaler",
    msg_block: "Bloquer",
    msg_request: "Demande de message",
    msg_seen: "Vu",
    msg_typing: "Écrit...",
    msg_retry: "Réessayer",
    err_generic: "Quelque chose a mal tourné.",
    err_network: "Connexion perdue. Veuillez réessayer.",
    err_not_found: "Impossible de charger ce contenu.",
    empty_default: "Rien ici pour le moment.",
    loading_default: "Chargement...",
    profile_follow: "Suivre",
    profile_following: "Suivi",
    profile_message: "Message",
    profile_followers: "Abonnés",
    profile_following_label: "Abonnements",
    time_yesterday: "Hier",
    safety_center: "Sécurité et confidentialité",
    report_title: "Signaler",
  },

  ar: {
    brand: "BURNBOARD",
    tagline: "بدون ذكاء اصطناعي. بشر يسخرون من بشر فقط.",
    dismiss: "تجاهل",
    close: "إغلاق",
    back: "رجوع",
    loading: "جارٍ التحميل...",
    error: "حدث خطأ ما",
    retry: "حاول مجددًا",
    save: "حفظ",
    cancel: "إلغاء",
    see_all: "عرض الكل",
    explore: "استكشف",
    share: "مشاركة",
    create_title: "ما الجديد؟",
    create_subtitle: "اختر ما تريد مشاركته مع المجتمع.",
    create_offline_draft: "أنت غير متصل. تم حفظ مسودتك — أعد الاتصال للنشر.",
    create_offline_photo: "أنت غير متصل. تم الاحتفاظ بصورتك وتفاصيلك — أعد الاتصال للنشر.",
    discover: "اكتشف",
    trending: "الرائج",
    nav_home: "الرئيسية",
    nav_discover: "اكتشف",
    nav_battles: "المعارك",
    nav_rankings: "الترتيب",
    nav_notifications: "الإشعارات",
    time_just_now: "الآن",
    time_min_ago: "منذ دقيقة",
    time_hour_ago: "منذ ساعة",
    time_day_ago: "منذ يوم",
    settings_language: "اللغة",
    settings_language_desc: "اختر لغة العرض.",
    language_saved: "تم حفظ اللغة",
    region_global: "عالمي",
    region_country: "الدولة",
    trending_global: "الرائج عالميًا",
    trending_country: "الرائج في الدولة",
    scope_global: "عالمي",
    scope_country: "الدولة",
    notif_followed: "بدأ {user} بمتابعتك",
    notif_reacted: "تفاعل {user} مع منشورك",
    notif_commented: "علّق {user} على منشورك",
    notif_mentioned: "ذكرك {user}",
    notif_invited: "دعاك {user}",
    notif_battle_won: "لقد فزت بالمعركة!",
    notif_challenge_done: "اكتمل التحدي!",
    notif_achievement: "حصلت على إنجاز: {name}",
    msg_send: "إرسال",
    msg_reply: "رد",
    msg_delete: "حذف",
    msg_copy: "نسخ",
    msg_report: "إبلاغ",
    msg_block: "حظر",
    msg_request: "طلب مراسلة",
    msg_seen: "تمت المشاهدة",
    msg_typing: "يكتب...",
    msg_retry: "إعادة المحاولة",
    err_generic: "حدث خطأ ما.",
    err_network: "انقطع الاتصال. حاول مجددًا.",
    err_not_found: "تعذّر تحميل هذا المحتوى.",
    empty_default: "لا يوجد شيء هنا بعد.",
    loading_default: "جارٍ التحميل...",
    profile_follow: "متابعة",
    profile_following: "تتابعه",
    profile_message: "مراسلة",
    profile_followers: "المتابِعون",
    profile_following_label: "يتابع",
    time_yesterday: "أمس",
    safety_center: "السلامة والخصوصية",
    report_title: "إبلاغ",
  },
};

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'bn', label: 'বাংলা', flag: '🇧🇩', dir: 'ltr' },
  { code: 'es', label: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳', dir: 'ltr' },
];

export const DEFAULT_LANGUAGE = 'en';
export const LANG_STORAGE_KEY = 'burnboard_lang';

export function isSupported(code) {
  return SUPPORTED_LANGUAGES.some(l => l.code === code);
}

/** Device/browser language mapped to a supported code (or null). */
export function browserLanguage() {
  if (typeof window === 'undefined' || !window.navigator) return null;
  try {
    const tags = [...(window.navigator.languages || []), window.navigator.language].filter(Boolean);
    for (const tag of tags) {
      const base = String(tag).toLowerCase().split(/[-_]/)[0];
      if (isSupported(base)) return base;
    }
  } catch {}
  return null;
}

export function getLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && isSupported(saved)) return saved;
  } catch {}
  return browserLanguage() || DEFAULT_LANGUAGE;
}

/**
 * Priority resolution (Phase 4/39):
 *   1. explicit account preference (when signed in)
 *   2. explicit device selection (localStorage)
 *   3. browser/device language
 *   4. English fallback
 */
export function resolveLanguage({ accountLocale } = {}) {
  const norm = (c) => (c && isSupported(String(c).toLowerCase().split(/[-_]/)[0]) ? String(c).toLowerCase().split(/[-_]/)[0] : null);
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      const explicit = norm(saved);
      // Account preference wins when signed in (it IS the explicit choice,
      // synced on every change); device choice applies when logged out.
      if (accountLocale !== undefined) return norm(accountLocale) || explicit || browserLanguage() || DEFAULT_LANGUAGE;
      if (explicit) return explicit;
    } catch {}
  } else if (accountLocale) {
    const normed = norm(accountLocale);
    if (normed) return normed;
  }
  if (typeof window !== 'undefined') return browserLanguage() || DEFAULT_LANGUAGE;
  return DEFAULT_LANGUAGE;
}

/** Persist an explicit selection (device + event). Server sync is separate. */
export function setLanguage(lang) {
  if (typeof window === 'undefined') return;
  try {
    if (isSupported(lang)) {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
      window.dispatchEvent(new CustomEvent('burnboard_lang_changed', { detail: lang }));
    }
  } catch {}
}

/** Pull the signed-in account preference into device state (no leaks). */
export async function syncLanguageFromAccount() {
  if (typeof window === 'undefined') return getLanguage();
  try {
    const res = await fetch('/api/account/language', { cache: 'no-store' });
    if (!res.ok) return getLanguage();
    const data = await res.json();
    if (data?.locale && isSupported(data.locale)) {
      localStorage.setItem(LANG_STORAGE_KEY, data.locale);
      window.dispatchEvent(new CustomEvent('burnboard_lang_changed', { detail: data.locale }));
      return data.locale;
    }
  } catch {}
  return getLanguage();
}

/** Push the explicit selection to the signed-in account (fire-and-forget). */
export function pushLanguageToAccount(lang) {
  try {
    if (!isSupported(lang)) return;
    fetch('/api/account/language', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: lang }),
    }).catch(() => {});
  } catch {}
}

/** Humanize a key so a missing translation never renders raw key text. */
function humanizeKey(key) {
  return String(key || '')
    .replace(/[.:]/g, ' ')
    .split('_')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase()) || '…';
}

function interpolate(template, vars) {
  if (!vars || typeof vars !== 'object') return template;
  let out = String(template);
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined || v === null) continue;
    // Plain-text interpolation only — values are never treated as HTML.
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/**
 * Translate with safe fallback: requested locale → English → humanized key.
 * Raw translation keys are NEVER shown to users. Supports {var} templates.
 */
export function t(key, langOrVars, maybeVars) {
  let lang;
  let vars;
  if (typeof langOrVars === 'string') {
    lang = langOrVars;
    vars = maybeVars;
  } else {
    vars = langOrVars;
  }
  const currentLang = (lang && isSupported(lang)) ? lang : getLanguage();
  const template = translations[currentLang]?.[key]
    ?? translations[DEFAULT_LANGUAGE]?.[key]
    ?? humanizeKey(key);
  return interpolate(template, vars);
}

/** System notification text from templates (no string concatenation). */
export function systemNotification(kind, vars, lang) {
  const map = {
    followed: 'notif_followed',
    reacted: 'notif_reacted',
    commented: 'notif_commented',
    mentioned: 'notif_mentioned',
    invited: 'notif_invited',
    battle_won: 'notif_battle_won',
    challenge_done: 'notif_challenge_done',
    achievement: 'notif_achievement',
  };
  const key = map[kind];
  if (!key) return '';
  return t(key, lang, vars);
}

export function getDirection() {
  const lang = getLanguage();
  return SUPPORTED_LANGUAGES.find(l => l.code === lang)?.dir || 'ltr';
}

export function getLanguageInfo(code) {
  return SUPPORTED_LANGUAGES.find(l => l.code === code) || SUPPORTED_LANGUAGES[0];
}

// ── Locale-aware Date Formatting ─────────────────────────────

const INTL_LOCALE_MAP = { en: 'en-US', bn: 'bn-BD', hi: 'hi-IN', es: 'es-ES', fr: 'fr-FR', ar: 'ar-EG' };

function intlLocaleOf(lang) {
  const base = String(lang || getLanguage()).toLowerCase().split(/[-_]/)[0];
  return INTL_LOCALE_MAP[base] || 'en-US';
}

export function formatDate(dateString, options = {}) {
  if (!dateString) return '';
  const lang = getLanguage();
  const locale = intlLocaleOf(lang);
  
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      ...options,
    });
  } catch {
    return new Date(dateString).toLocaleDateString('en-US', options);
  }
}

export function formatTime(dateString) {
  if (!dateString) return '';
  const lang = getLanguage();
  const locale = intlLocaleOf(lang);
  
  try {
    return new Date(dateString).toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

export function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diff = Math.max(0, Math.floor((now - past) / 1000));
  
  if (diff < 60) return t('time_just_now');
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}${t('time_min_ago')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}${t('time_hour_ago')}`;
  const d = Math.floor(h / 24);
  return `${d}${t('time_day_ago')}`;
}

// ── Locale-aware Number Formatting ───────────────────────────

export function formatCount(n) {
  if (n >= 1000) {
    try {
      return new Intl.NumberFormat(intlLocaleOf(getLanguage()), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    } catch {
      return `${(n / 1000).toFixed(1)}k`;
    }
  }
  const lang = getLanguage();
  const locale = intlLocaleOf(lang);
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}
