CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"name" text DEFAULT 'Browser Extension' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"drafts" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "briefing_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"suppressed" boolean DEFAULT false NOT NULL,
	"suppressed_at" timestamp with time zone,
	"suppress_reason" text,
	"actions_taken" integer DEFAULT 0 NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_processing_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" numeric,
	"lead_created" boolean DEFAULT false NOT NULL,
	"lead_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"lead_id" uuid,
	"lead_snapshot" jsonb NOT NULL,
	"lead_embedding" vector(1536),
	"contacted_at" timestamp with time zone NOT NULL,
	"outcome" text,
	"similarity_threshold" numeric,
	"boomerang_source_lead_id" uuid,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"ai_score" integer DEFAULT 0 NOT NULL,
	"ai_summary" text DEFAULT '' NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skill_gaps" text[] DEFAULT '{}'::text[] NOT NULL,
	"alliance_eligible" boolean DEFAULT false NOT NULL,
	"debrief" jsonb,
	"debrief_generated_at" timestamp with time zone,
	"golden_hour_notified_at" timestamp with time zone,
	"golden_hour_responded_at" timestamp with time zone,
	"scheduled_job_id" text,
	"is_autopilot" boolean DEFAULT false NOT NULL,
	"actioned_from_briefing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"url" text NOT NULL,
	"client_name" text,
	"client_url" text,
	"budget" numeric,
	"budget_type" text,
	"budget_min" numeric,
	"budget_max" numeric,
	"skills_required" text[] DEFAULT '{}'::text[] NOT NULL,
	"location" text,
	"remote" boolean DEFAULT false NOT NULL,
	"experience_level" text,
	"category" text,
	"poster_id" text,
	"poster_name" text,
	"poster_history_score" integer,
	"applicant_count" integer,
	"contact_email" text,
	"contact_linkedin" text,
	"status" text DEFAULT 'new' NOT NULL,
	"golden_hour" boolean DEFAULT false NOT NULL,
	"boomerang" boolean DEFAULT false NOT NULL,
	"boomerang_ref" uuid,
	"boomerang_context" jsonb,
	"company_health" jsonb,
	"portfolio_matches" jsonb,
	"recipient_timezone" text,
	"trigger_event" jsonb,
	"community_source" jsonb,
	"competition_level" text,
	"embedding" vector(1536),
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outreach_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"lead_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"draft_content" text NOT NULL,
	"subject" text,
	"portfolio_piece_id" uuid,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"is_autopilot" boolean DEFAULT false NOT NULL,
	"actioned_from_briefing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pattern_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"report" jsonb NOT NULL,
	"loss_count_at_generation" numeric NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_pieces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"url" text,
	"skills_demonstrated" text[] DEFAULT '{}'::text[] NOT NULL,
	"outcomes" text,
	"embedding" vector(1536),
	"embedding_status" text DEFAULT 'pending' NOT NULL,
	"matched_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trigger_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid,
	"user_id" text NOT NULL,
	"company_name" text NOT NULL,
	"event_type" text NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"core_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"preferred_skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"experience_years" integer DEFAULT 0 NOT NULL,
	"hourly_rate" numeric,
	"availability" text DEFAULT 'full_time' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"portfolio_url" text,
	"linkedin_url" text,
	"github_url" text,
	"preferred_project_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"preferred_sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"min_budget" numeric,
	"max_budget" numeric,
	"embedding" vector(1536),
	"notification_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"autopilot_enabled" boolean DEFAULT false NOT NULL,
	"autopilot_rules" jsonb,
	"autopilot_pause_config" jsonb,
	"auto_send_enabled" boolean DEFAULT false NOT NULL,
	"briefing_delivery_time" text DEFAULT '07:00' NOT NULL,
	"briefing_snooze_until" timestamp with time zone,
	"briefing_channel" text DEFAULT 'email' NOT NULL,
	"briefing_email_bounced" boolean DEFAULT false NOT NULL,
	"community_tokens" jsonb,
	"slack_monitored_channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"alliance_opt_in" boolean DEFAULT false NOT NULL,
	"filter_hide_red_companies" boolean DEFAULT false NOT NULL,
	"phone_number" text,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"golden_hour_sms" boolean DEFAULT false NOT NULL,
	"profile_completeness" integer DEFAULT 0 NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"company_name" text NOT NULL,
	"company_url" text,
	"company_crunchbase_id" text,
	"notes" text,
	"github_stars_baseline" jsonb,
	"latest_funding_round_at" timestamp with time zone,
	"last_blog_post_url" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_queue" ADD CONSTRAINT "approval_queue_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_history" ADD CONSTRAINT "lead_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "outreach_sends" ADD CONSTRAINT "outreach_sends_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trigger_events" ADD CONSTRAINT "trigger_events_watchlist_id_watchlist_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlist"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trigger_events" ADD CONSTRAINT "trigger_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_queue_user_id_idx" ON "approval_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_queue_status_idx" ON "approval_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_log_user_id_idx" ON "briefing_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "briefing_log_generated_at_idx" ON "briefing_log" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_log_platform_channel_idx" ON "community_processing_log" USING btree ("platform","channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_log_processed_at_idx" ON "community_processing_log" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_history_user_id_idx" ON "lead_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_history_archived_at_idx" ON "lead_history" USING btree ("archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_scores_lead_user_uniq" ON "lead_scores" USING btree ("lead_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_scores_user_id_idx" ON "lead_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_scores_ai_score_idx" ON "lead_scores" USING btree ("ai_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_source_idx" ON "leads" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_ingested_at_idx" ON "leads" USING btree ("ingested_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_golden_hour_idx" ON "leads" USING btree ("golden_hour");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_source_source_id_uniq" ON "leads" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outreach_sends_user_id_idx" ON "outreach_sends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outreach_sends_lead_id_idx" ON "outreach_sends" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_pieces_user_id_idx" ON "portfolio_pieces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trigger_events_user_id_idx" ON "trigger_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_clerk_user_id_uniq" ON "user_profiles" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_user_id_idx" ON "watchlist" USING btree ("user_id");