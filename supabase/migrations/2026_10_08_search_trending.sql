-- BURNBOARD Search — trending queries (privacy-aware, additive only)
--
-- Stores normalized queries ONLY (lowercased, trimmed, 3–40 chars).
-- Refuses emails, phone-like strings, and @handle-only queries so
-- personal identifiers never become trends. 8-day retention window;
-- reads filter by window, and every trending read prunes expired rows.

CREATE TABLE IF NOT EXISTS search_queries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_window ON search_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_query ON search_queries(query, created_at DESC);

ALTER TABLE search_queries ENABLE ROW LEVEL SECURITY;
-- Deny-all: writes via log_search_query only; reads via trending_searches.

-- Log a normalized query (PII-guarded, retention-friendly).
CREATE OR REPLACE FUNCTION public.log_search_query(p_query TEXT, p_scope TEXT DEFAULT 'all', p_user UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_q TEXT;
BEGIN
  IF p_query IS NULL THEN
    RETURN false;
  END IF;
  v_q := lower(trim(p_query));
  -- Strip a single leading # (hashtag searches trend as plain terms).
  v_q := regexp_replace(v_q, '^#+', '');
  v_q := regexp_replace(v_q, '\s+', ' ', 'g');
  IF char_length(v_q) < 3 OR char_length(v_q) > 40 THEN
    RETURN false;
  END IF;
  -- PII guards: emails, phone-like digit runs, @handles.
  IF v_q ~ '@' THEN
    RETURN false;
  END IF;
  IF v_q ~ '[0-9]{7,}' THEN
    RETURN false;
  END IF;
  INSERT INTO search_queries (query, user_id, scope)
  VALUES (v_q, p_user, COALESCE(p_scope, 'all'));
  RETURN true;
END;
$$;

-- Trending searches over a time window. Ranked by distinct-user velocity
-- with a minimum-participant bar (manipulation resistance): a lone actor
-- repeating a term can never trend it. Never fabricated — empty when quiet.
CREATE OR REPLACE FUNCTION public.trending_searches(p_window TEXT DEFAULT 'today', p_limit INT DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_rows JSONB;
BEGIN
  -- Retention prune on read (cheap, bounded).
  DELETE FROM search_queries WHERE created_at < now() - interval '8 days';

  IF p_window = 'now' THEN
    v_since := now() - interval '6 hours';
  ELSIF p_window = 'week' THEN
    v_since := now() - interval '7 days';
  ELSE
    v_since := now() - interval '24 hours';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'query', t.query, 'searches', t.searches, 'users', t.users
  ) ORDER BY t.users DESC, t.searches DESC), '[]'::jsonb)
  INTO v_rows FROM (
    SELECT query, count(*) AS searches, count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS users
    FROM search_queries
    WHERE created_at >= v_since
    GROUP BY query
    HAVING count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) >= 2
        OR count(*) >= 5
    ORDER BY count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) DESC, count(*) DESC
    LIMIT LEAST(p_limit, 20)
  ) t;

  RETURN jsonb_build_object('success', true, 'window', p_window, 'trends', v_rows);
END;
$$;
