-- ============================================================
-- EQUIPMENT CHAIN-OF-CUSTODY LEDGER
-- Supabase SQL Setup Script  (SAFE TO RE-RUN)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. CUSTOM TYPES / ENUMS  (create only if they don't exist)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('field_user', 'commanding_officer');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_type') THEN
    CREATE TYPE asset_type AS ENUM ('drone', 'radio', 'vehicle', 'weapon', 'optics', 'medical', 'comms', 'other');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status') THEN
    CREATE TYPE asset_status AS ENUM ('available', 'checked_out', 'maintenance', 'decommissioned');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'custody_action') THEN
    CREATE TYPE custody_action AS ENUM ('check_out', 'check_in', 'transfer', 'maintenance_start', 'maintenance_end', 'registered');
  END IF;
END $$;

-- 2. PROFILES TABLE (extends auth.users)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  callsign TEXT,
  unit TEXT DEFAULT 'Unassigned',
  role user_role DEFAULT 'field_user',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles RLS policies (drop first to avoid duplicates)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "COs can view all profiles" ON public.profiles;
CREATE POLICY "COs can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'commanding_officer'
    )
  );

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 3. ASSETS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type asset_type DEFAULT 'other',
  serial_number TEXT UNIQUE NOT NULL,
  status asset_status DEFAULT 'available',
  current_holder_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  location TEXT,
  notes TEXT,
  image_url TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Field users see own and available assets" ON public.assets;
CREATE POLICY "Field users see own and available assets"
  ON public.assets FOR SELECT
  USING (
    current_holder_id = auth.uid()
    OR status = 'available'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'commanding_officer'
    )
  );

DROP POLICY IF EXISTS "COs can create assets" ON public.assets;
CREATE POLICY "COs can create assets"
  ON public.assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'commanding_officer'
    )
  );

DROP POLICY IF EXISTS "COs can update any asset" ON public.assets;
CREATE POLICY "COs can update any asset"
  ON public.assets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'commanding_officer'
    )
  );

DROP POLICY IF EXISTS "Field users can update own assets" ON public.assets;
CREATE POLICY "Field users can update own assets"
  ON public.assets FOR UPDATE
  USING (current_holder_id = auth.uid())
  WITH CHECK (current_holder_id = auth.uid() OR current_holder_id IS NULL);

DROP POLICY IF EXISTS "COs can delete assets" ON public.assets;
CREATE POLICY "COs can delete assets"
  ON public.assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'commanding_officer'
    )
  );

-- 4. CUSTODY LOGS TABLE (immutable audit trail)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.custody_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  action custody_action NOT NULL,
  performed_by UUID NOT NULL REFERENCES public.profiles(id),
  received_by UUID REFERENCES public.profiles(id),
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custody_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Field users see own custody logs" ON public.custody_logs;
CREATE POLICY "Field users see own custody logs"
  ON public.custody_logs FOR SELECT
  USING (
    performed_by = auth.uid()
    OR received_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'commanding_officer'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create custody logs" ON public.custody_logs;
CREATE POLICY "Authenticated users can create custody logs"
  ON public.custody_logs FOR INSERT
  WITH CHECK (auth.uid() = performed_by);

-- 5. FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_asset_updated ON public.assets;
CREATE TRIGGER on_asset_updated
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, callsign)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'callsign', NULL)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_assets_status ON public.assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_holder ON public.assets(current_holder_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON public.assets(type);
CREATE INDEX IF NOT EXISTS idx_custody_asset ON public.custody_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_custody_performer ON public.custody_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_custody_created ON public.custody_logs(created_at DESC);

-- 7. ENABLE REALTIME
-- ============================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.custody_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SETUP COMPLETE!
-- Now create user accounts via the app's registration form.
-- The first user you want as CO should be manually updated:
--   UPDATE public.profiles SET role = 'commanding_officer' WHERE id = '<user-uuid>';
-- ============================================================
