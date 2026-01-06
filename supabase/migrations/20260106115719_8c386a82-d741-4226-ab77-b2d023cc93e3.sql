-- Drop Gmail-related tables to eliminate security risk
-- Must drop in correct order due to foreign key constraints

-- First drop gmail_synced_messages (references gmail_connections)
DROP TABLE IF EXISTS public.gmail_synced_messages;

-- Then drop gmail_sync_rules (references gmail_connections)
DROP TABLE IF EXISTS public.gmail_sync_rules;

-- Finally drop gmail_connections (main table)
DROP TABLE IF EXISTS public.gmail_connections;