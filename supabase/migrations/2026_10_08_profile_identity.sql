-- BURNBOARD Profile — explicit display location (additive only)
--
-- location_text is DISPLAY ONLY, entered explicitly by the user
-- (e.g. "Dhaka, Bangladesh"). Never GPS, never EXIF, never automatic.
-- Covered by existing user_profiles RLS (owner write, public read).

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS location_text TEXT;
