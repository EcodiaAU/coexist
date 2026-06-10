-- UNIFIED ROLE SYSTEM - Part 1: Add missing values to both enums
-- Both profiles.role and collective_members.role will share the same value space.
-- Hierarchy: participant < assist_leader < co_leader < leader < manager < admin

-- Add missing values to user_role enum
-- Currently: participant, national_leader, manager, admin
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'assist_leader';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'co_leader';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'leader';

-- Add missing values to collective_role enum
-- Currently: member, assist_leader, co_leader, leader
ALTER TYPE collective_role ADD VALUE IF NOT EXISTS 'participant';
ALTER TYPE collective_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE collective_role ADD VALUE IF NOT EXISTS 'admin';
