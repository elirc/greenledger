CREATE TYPE "public"."application_type" AS ENUM('fertigation', 'spray');--> statement-breakpoint
CREATE TYPE "public"."base_unit" AS ENUM('kg', 'g', 'l', 'ml', 'pcs');--> statement-breakpoint
CREATE TYPE "public"."cycle_status" AS ENUM('planned', 'nursery', 'growing', 'harvesting', 'closed');--> statement-breakpoint
CREATE TYPE "public"."equipment_status" AS ENUM('operational', 'needs_service', 'broken', 'retired');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('labour', 'power', 'water', 'repairs', 'transport', 'other');--> statement-breakpoint
CREATE TYPE "public"."greenhouse_type" AS ENUM('greenhouse', 'net_house', 'shade_house', 'open_field');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('receive', 'issue', 'transfer_in', 'transfer_out', 'adjustment', 'return');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('seed', 'growing_media', 'fertiliser', 'agrochemical', 'packaging', 'consumable', 'spare_part');--> statement-breakpoint
CREATE TYPE "public"."nursery_batch_status" AS ENUM('open', 'transplanted', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."produce_grade" AS ENUM('a', 'b', 'c', 'reject');--> statement-breakpoint
CREATE TYPE "public"."produce_movement_type" AS ENUM('harvest_in', 'transfer_in', 'transfer_out', 'sale', 'waste', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('unpaid', 'part_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."scouting_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."stock_count_status" AS ENUM('draft', 'posted');--> statement-breakpoint
CREATE TYPE "public"."store_type" AS ENUM('input_store', 'cold_room', 'packhouse');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"phone_number" text,
	"phone_number_verified" boolean,
	"is_platform_admin" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "greenhouse_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"greenhouse_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "greenhouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "greenhouse_type" DEFAULT 'greenhouse' NOT NULL,
	"area_m_2" numeric(10, 2) NOT NULL,
	"plant_capacity" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"entry_safe_at" timestamp with time zone,
	"harvest_safe_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "store_type" DEFAULT 'input_store' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"greenhouse_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"shelf_life_days" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varieties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"crop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"days_to_first_harvest" integer NOT NULL,
	"harvest_duration_weeks" integer NOT NULL,
	"expected_yield_kg_per_plant" numeric(6, 2) NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"item_batch_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"type" "inventory_movement_type" NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"greenhouse_id" uuid,
	"crop_cycle_id" uuid,
	"application_id" uuid,
	"receipt_line_id" uuid,
	"stock_count_id" uuid,
	"transfer_id" uuid,
	"reason" text,
	"performed_by" text NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inv_mov_sign_per_type" CHECK ((type IN ('receive','transfer_in','return') AND quantity > 0) OR (type IN ('issue','transfer_out') AND quantity < 0) OR (type = 'adjustment' AND quantity <> 0))
);
--> statement-breakpoint
CREATE TABLE "item_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"supplier_id" uuid,
	"batch_number" text NOT NULL,
	"expiry_date" date,
	"unit_cost_kobo" numeric(16, 6) DEFAULT '0' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"category" "item_category" NOT NULL,
	"base_unit" "base_unit" NOT NULL,
	"reorder_level" numeric(14, 3) DEFAULT '0' NOT NULL,
	"active_ingredient" text,
	"phi_days" integer,
	"rei_hours" integer,
	"n_pct" numeric(5, 2),
	"p_pct" numeric(5, 2),
	"k_pct" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_phi_rei_chemicals_only" CHECK (category = 'agrochemical' OR (phi_days IS NULL AND rei_hours IS NULL))
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"receipt_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_batch_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost_kobo" numeric(16, 6) NOT NULL,
	"line_cost_kobo" bigint NOT NULL,
	CONSTRAINT "receipt_lines_quantity_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"supplier_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"reference" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by" text NOT NULL,
	"total_cost_kobo" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"item_batch_id" uuid NOT NULL,
	"counted_quantity" numeric(14, 3) NOT NULL,
	"system_quantity" numeric(14, 3) NOT NULL,
	"difference" numeric(14, 3) NOT NULL,
	CONSTRAINT "stock_count_lines_counted_nonneg" CHECK (counted_quantity >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "stock_count_status" DEFAULT 'draft' NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counted_by" text NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crop_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"greenhouse_id" uuid NOT NULL,
	"zone_id" uuid,
	"variety_id" uuid NOT NULL,
	"nursery_batch_id" uuid,
	"code" text NOT NULL,
	"sow_date" date,
	"transplant_date" date,
	"plants_transplanted" integer DEFAULT 0 NOT NULL,
	"plants_alive" integer DEFAULT 0 NOT NULL,
	"expected_first_harvest" date,
	"expected_end" date,
	"status" "cycle_status" DEFAULT 'planned' NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nursery_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"variety_id" uuid NOT NULL,
	"seed_item_batch_id" uuid,
	"sow_date" date NOT NULL,
	"trays" integer NOT NULL,
	"cells_per_tray" integer NOT NULL,
	"seeds_sown" integer NOT NULL,
	"germinated" integer DEFAULT 0 NOT NULL,
	"ready" integer DEFAULT 0 NOT NULL,
	"transplanted" integer DEFAULT 0 NOT NULL,
	"discarded" integer DEFAULT 0 NOT NULL,
	"status" "nursery_batch_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nursery_batches_positive_setup" CHECK (trays > 0 AND cells_per_tray > 0 AND seeds_sown > 0),
	CONSTRAINT "nursery_batches_counts_nonneg" CHECK (germinated >= 0 AND ready >= 0 AND transplanted >= 0 AND discarded >= 0)
);
--> statement-breakpoint
CREATE TABLE "plant_losses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"crop_cycle_id" uuid NOT NULL,
	"date" date NOT NULL,
	"count" integer NOT NULL,
	"cause" text NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plant_losses_count_positive" CHECK (count > 0)
);
--> statement-breakpoint
CREATE TABLE "scouting_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"crop_cycle_id" uuid NOT NULL,
	"date" date NOT NULL,
	"pest_or_disease" text NOT NULL,
	"severity" "scouting_severity" NOT NULL,
	"photo_file_id" uuid,
	"action_taken" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_batch_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"phi_days_snapshot" integer,
	"rei_hours_snapshot" integer,
	CONSTRAINT "application_items_qty_positive" CHECK (quantity > 0)
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"greenhouse_id" uuid NOT NULL,
	"crop_cycle_id" uuid NOT NULL,
	"type" "application_type" NOT NULL,
	"recipe_id" uuid,
	"water_volume_litres" numeric(10, 1) NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	"operator_id" text NOT NULL,
	"entry_safe_at" timestamp with time zone,
	"harvest_safe_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_volume_positive" CHECK (water_volume_litres > 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"recipe_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_per_1000l" numeric(14, 3) NOT NULL,
	CONSTRAINT "recipe_lines_qty_positive" CHECK (quantity_per_1000l > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "application_type" NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvest_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"harvest_id" uuid NOT NULL,
	"grade" "produce_grade" NOT NULL,
	"crates" numeric(8, 2) DEFAULT '0' NOT NULL,
	"kg" numeric(14, 3) NOT NULL,
	CONSTRAINT "harvest_lines_kg_positive" CHECK (kg > 0)
);
--> statement-breakpoint
CREATE TABLE "harvests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"greenhouse_id" uuid NOT NULL,
	"crop_cycle_id" uuid NOT NULL,
	"harvested_at" timestamp with time zone NOT NULL,
	"harvested_by" text NOT NULL,
	"phi_override" boolean DEFAULT false NOT NULL,
	"phi_override_reason" text,
	"phi_override_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "harvests_override_pairing" CHECK (phi_override = false OR (phi_override_reason IS NOT NULL AND phi_override_by IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "produce_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"crop_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"grade" "produce_grade" NOT NULL,
	"harvest_id" uuid,
	"harvested_at" timestamp with time zone NOT NULL,
	"best_before_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produce_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"produce_lot_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"type" "produce_movement_type" NOT NULL,
	"kg" numeric(14, 3) NOT NULL,
	"sale_line_id" uuid,
	"waste_reason" text,
	"transfer_id" uuid,
	"performed_by" text NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prod_mov_sign_per_type" CHECK ((type IN ('harvest_in','transfer_in') AND kg > 0) OR (type IN ('transfer_out','sale','waste') AND kg < 0) OR (type = 'adjustment' AND kg <> 0))
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"key" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments_received" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"sale_id" uuid NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by" text NOT NULL,
	"notes" text,
	CONSTRAINT "payments_amount_positive" CHECK (amount_kobo > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"sale_id" uuid NOT NULL,
	"crop_id" uuid NOT NULL,
	"grade" "produce_grade" NOT NULL,
	"kg" numeric(14, 3) NOT NULL,
	"crates" numeric(8, 2),
	"price_basis" text DEFAULT 'per_kg' NOT NULL,
	"unit_price_kobo" bigint NOT NULL,
	"line_total_kobo" bigint NOT NULL,
	CONSTRAINT "sale_lines_kg_positive" CHECK (kg > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"sale_date" date NOT NULL,
	"status" "sale_status" DEFAULT 'unpaid' NOT NULL,
	"total_kobo" bigint DEFAULT 0 NOT NULL,
	"amount_paid_kobo" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"site_id" uuid,
	"greenhouse_id" uuid,
	"location_note" text,
	"serial_number" text,
	"purchase_date" date,
	"cost_kobo" bigint DEFAULT 0 NOT NULL,
	"status" "equipment_status" DEFAULT 'operational' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"equipment_id" uuid NOT NULL,
	"schedule_id" uuid,
	"done_date" date NOT NULL,
	"description" text NOT NULL,
	"cost_kobo" bigint DEFAULT 0 NOT NULL,
	"done_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"equipment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"interval_days" integer NOT NULL,
	"last_done_date" date,
	"next_due_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maint_sched_interval_positive" CHECK (interval_days > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "climate_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"greenhouse_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"temperature_c" numeric(5, 2),
	"humidity_pct" numeric(5, 2),
	"ec_ms_cm" numeric(6, 3),
	"ph" numeric(4, 2),
	"recorded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "climate_at_least_one_reading" CHECK (temperature_c IS NOT NULL OR humidity_pct IS NOT NULL OR ec_ms_cm IS NOT NULL OR ph IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_kobo" bigint NOT NULL,
	"incurred_date" date NOT NULL,
	"site_id" uuid,
	"crop_cycle_id" uuid,
	"greenhouse_id" uuid,
	"description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK (amount_kobo > 0)
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" uuid,
	"dedup_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"greenhouse_id" uuid,
	"crop_cycle_id" uuid,
	"assigned_to" text,
	"due_date" date,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"max_greenhouses" integer NOT NULL,
	"monthly_price_kobo" bigint NOT NULL,
	"paystack_plan_code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone,
	"paystack_customer_code" text,
	"paystack_subscription_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_organisationId_unique" UNIQUE("organisation_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'paystack' NOT NULL,
	"event_type" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_ops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organisation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"error" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greenhouse_assignments" ADD CONSTRAINT "greenhouse_assignments_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greenhouse_assignments" ADD CONSTRAINT "greenhouse_assignments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greenhouse_assignments" ADD CONSTRAINT "greenhouse_assignments_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greenhouses" ADD CONSTRAINT "greenhouses_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greenhouses" ADD CONSTRAINT "greenhouses_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crops" ADD CONSTRAINT "crops_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varieties" ADD CONSTRAINT "varieties_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_batch_id_item_batches_id_fk" FOREIGN KEY ("item_batch_id") REFERENCES "public"."item_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_receipt_line_id_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."receipt_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_user_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_item_batch_id_item_batches_id_fk" FOREIGN KEY ("item_batch_id") REFERENCES "public"."item_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_batch_id_item_batches_id_fk" FOREIGN KEY ("item_batch_id") REFERENCES "public"."item_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_counted_by_user_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_posted_by_user_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_variety_id_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_nursery_batch_id_nursery_batches_id_fk" FOREIGN KEY ("nursery_batch_id") REFERENCES "public"."nursery_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursery_batches" ADD CONSTRAINT "nursery_batches_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursery_batches" ADD CONSTRAINT "nursery_batches_variety_id_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursery_batches" ADD CONSTRAINT "nursery_batches_seed_item_batch_id_item_batches_id_fk" FOREIGN KEY ("seed_item_batch_id") REFERENCES "public"."item_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nursery_batches" ADD CONSTRAINT "nursery_batches_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_losses" ADD CONSTRAINT "plant_losses_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_losses" ADD CONSTRAINT "plant_losses_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_losses" ADD CONSTRAINT "plant_losses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouting_logs" ADD CONSTRAINT "scouting_logs_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouting_logs" ADD CONSTRAINT "scouting_logs_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouting_logs" ADD CONSTRAINT "scouting_logs_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouting_logs" ADD CONSTRAINT "scouting_logs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_items" ADD CONSTRAINT "application_items_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_items" ADD CONSTRAINT "application_items_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_items" ADD CONSTRAINT "application_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_items" ADD CONSTRAINT "application_items_item_batch_id_item_batches_id_fk" FOREIGN KEY ("item_batch_id") REFERENCES "public"."item_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_operator_id_user_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lines" ADD CONSTRAINT "harvest_lines_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lines" ADD CONSTRAINT "harvest_lines_harvest_id_harvests_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."harvests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_harvested_by_user_id_fk" FOREIGN KEY ("harvested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_phi_override_by_user_id_fk" FOREIGN KEY ("phi_override_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_lots" ADD CONSTRAINT "produce_lots_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_lots" ADD CONSTRAINT "produce_lots_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_lots" ADD CONSTRAINT "produce_lots_variety_id_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_lots" ADD CONSTRAINT "produce_lots_harvest_id_harvests_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."harvests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_movements" ADD CONSTRAINT "produce_movements_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_movements" ADD CONSTRAINT "produce_movements_produce_lot_id_produce_lots_id_fk" FOREIGN KEY ("produce_lot_id") REFERENCES "public"."produce_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_movements" ADD CONSTRAINT "produce_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_movements" ADD CONSTRAINT "produce_movements_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_movements" ADD CONSTRAINT "produce_movements_performed_by_user_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_schedule_id_maintenance_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_readings" ADD CONSTRAINT "climate_readings_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_readings" ADD CONSTRAINT "climate_readings_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_readings" ADD CONSTRAINT "climate_readings_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_greenhouse_id_greenhouses_id_fk" FOREIGN KEY ("greenhouse_id") REFERENCES "public"."greenhouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_ops" ADD CONSTRAINT "sync_ops_organisation_id_organization_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_ops" ADD CONSTRAINT "sync_ops_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_assign_org_user_gh_uidx" ON "greenhouse_assignments" USING btree ("organisation_id","user_id","greenhouse_id");--> statement-breakpoint
CREATE INDEX "gh_assign_org_user_idx" ON "greenhouse_assignments" USING btree ("organisation_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "greenhouses_org_name_uidx" ON "greenhouses" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "greenhouses_org_site_idx" ON "greenhouses" USING btree ("organisation_id","site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_org_name_uidx" ON "sites" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "sites_org_idx" ON "sites" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_org_name_uidx" ON "stores" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "stores_org_site_idx" ON "stores" USING btree ("organisation_id","site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zones_greenhouse_name_uidx" ON "zones" USING btree ("greenhouse_id","name");--> statement-breakpoint
CREATE INDEX "zones_org_greenhouse_idx" ON "zones" USING btree ("organisation_id","greenhouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crops_org_name_uidx" ON "crops" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "varieties_org_crop_name_uidx" ON "varieties" USING btree ("organisation_id","crop_id","name");--> statement-breakpoint
CREATE INDEX "varieties_org_crop_idx" ON "varieties" USING btree ("organisation_id","crop_id");--> statement-breakpoint
CREATE INDEX "inv_mov_org_batch_store_idx" ON "inventory_movements" USING btree ("organisation_id","item_batch_id","store_id");--> statement-breakpoint
CREATE INDEX "inv_mov_org_item_idx" ON "inventory_movements" USING btree ("organisation_id","item_id");--> statement-breakpoint
CREATE INDEX "inv_mov_org_store_idx" ON "inventory_movements" USING btree ("organisation_id","store_id");--> statement-breakpoint
CREATE INDEX "inv_mov_org_cycle_idx" ON "inventory_movements" USING btree ("organisation_id","crop_cycle_id");--> statement-breakpoint
CREATE INDEX "inv_mov_org_performed_idx" ON "inventory_movements" USING btree ("organisation_id","performed_at");--> statement-breakpoint
CREATE INDEX "inv_mov_transfer_idx" ON "inventory_movements" USING btree ("transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_batches_org_item_batchno_uidx" ON "item_batches" USING btree ("organisation_id","item_id","batch_number");--> statement-breakpoint
CREATE INDEX "item_batches_org_item_idx" ON "item_batches" USING btree ("organisation_id","item_id");--> statement-breakpoint
CREATE INDEX "item_batches_org_expiry_idx" ON "item_batches" USING btree ("organisation_id","expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "items_org_name_uidx" ON "items" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "items_org_category_idx" ON "items" USING btree ("organisation_id","category");--> statement-breakpoint
CREATE INDEX "receipt_lines_receipt_idx" ON "receipt_lines" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipt_lines_org_item_idx" ON "receipt_lines" USING btree ("organisation_id","item_id");--> statement-breakpoint
CREATE INDEX "receipts_org_received_idx" ON "receipts" USING btree ("organisation_id","received_at");--> statement-breakpoint
CREATE INDEX "receipts_org_supplier_idx" ON "receipts" USING btree ("organisation_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_lines_count_batch_uidx" ON "stock_count_lines" USING btree ("stock_count_id","item_batch_id");--> statement-breakpoint
CREATE INDEX "stock_counts_org_store_status_idx" ON "stock_counts" USING btree ("organisation_id","store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_org_name_uidx" ON "suppliers" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "crop_cycles_org_code_uidx" ON "crop_cycles" USING btree ("organisation_id","code");--> statement-breakpoint
CREATE INDEX "crop_cycles_org_gh_status_idx" ON "crop_cycles" USING btree ("organisation_id","greenhouse_id","status");--> statement-breakpoint
CREATE INDEX "crop_cycles_org_status_idx" ON "crop_cycles" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "nursery_batches_org_status_idx" ON "nursery_batches" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "nursery_batches_org_variety_idx" ON "nursery_batches" USING btree ("organisation_id","variety_id");--> statement-breakpoint
CREATE INDEX "plant_losses_org_cycle_date_idx" ON "plant_losses" USING btree ("organisation_id","crop_cycle_id","date");--> statement-breakpoint
CREATE INDEX "scouting_logs_org_cycle_date_idx" ON "scouting_logs" USING btree ("organisation_id","crop_cycle_id","date");--> statement-breakpoint
CREATE INDEX "application_items_app_idx" ON "application_items" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "application_items_org_item_idx" ON "application_items" USING btree ("organisation_id","item_id");--> statement-breakpoint
CREATE INDEX "applications_org_gh_applied_idx" ON "applications" USING btree ("organisation_id","greenhouse_id","applied_at");--> statement-breakpoint
CREATE INDEX "applications_org_cycle_idx" ON "applications" USING btree ("organisation_id","crop_cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_lines_recipe_item_uidx" ON "recipe_lines" USING btree ("recipe_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_org_name_uidx" ON "recipes" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "harvest_lines_harvest_grade_uidx" ON "harvest_lines" USING btree ("harvest_id","grade");--> statement-breakpoint
CREATE INDEX "harvests_org_cycle_at_idx" ON "harvests" USING btree ("organisation_id","crop_cycle_id","harvested_at");--> statement-breakpoint
CREATE INDEX "harvests_org_gh_idx" ON "harvests" USING btree ("organisation_id","greenhouse_id");--> statement-breakpoint
CREATE INDEX "produce_lots_org_grade_bb_idx" ON "produce_lots" USING btree ("organisation_id","grade","best_before_date");--> statement-breakpoint
CREATE INDEX "produce_lots_org_harvested_idx" ON "produce_lots" USING btree ("organisation_id","harvested_at");--> statement-breakpoint
CREATE INDEX "prod_mov_org_lot_store_idx" ON "produce_movements" USING btree ("organisation_id","produce_lot_id","store_id");--> statement-breakpoint
CREATE INDEX "prod_mov_org_store_idx" ON "produce_movements" USING btree ("organisation_id","store_id");--> statement-breakpoint
CREATE INDEX "prod_mov_org_performed_idx" ON "produce_movements" USING btree ("organisation_id","performed_at");--> statement-breakpoint
CREATE INDEX "prod_mov_sale_line_idx" ON "produce_movements" USING btree ("sale_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "counters_org_key_uidx" ON "counters" USING btree ("organisation_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_name_uidx" ON "customers" USING btree ("organisation_id","name");--> statement-breakpoint
CREATE INDEX "payments_org_sale_idx" ON "payments_received" USING btree ("organisation_id","sale_id");--> statement-breakpoint
CREATE INDEX "payments_org_received_idx" ON "payments_received" USING btree ("organisation_id","received_at");--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_org_invoice_uidx" ON "sales" USING btree ("organisation_id","invoice_number");--> statement-breakpoint
CREATE INDEX "sales_org_date_idx" ON "sales" USING btree ("organisation_id","sale_date");--> statement-breakpoint
CREATE INDEX "sales_org_status_idx" ON "sales" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "sales_org_customer_idx" ON "sales" USING btree ("organisation_id","customer_id");--> statement-breakpoint
CREATE INDEX "equipment_org_status_idx" ON "equipment" USING btree ("organisation_id","status");--> statement-breakpoint
CREATE INDEX "maint_logs_org_equip_date_idx" ON "maintenance_logs" USING btree ("organisation_id","equipment_id","done_date");--> statement-breakpoint
CREATE INDEX "maint_sched_org_due_idx" ON "maintenance_schedules" USING btree ("organisation_id","next_due_date") WHERE is_active;--> statement-breakpoint
CREATE INDEX "audit_org_created_idx" ON "audit_log" USING btree ("organisation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_org_entity_idx" ON "audit_log" USING btree ("organisation_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "climate_org_gh_at_idx" ON "climate_readings" USING btree ("organisation_id","greenhouse_id","recorded_at");--> statement-breakpoint
CREATE INDEX "expenses_org_date_idx" ON "expenses" USING btree ("organisation_id","incurred_date");--> statement-breakpoint
CREATE INDEX "expenses_org_cycle_idx" ON "expenses" USING btree ("organisation_id","crop_cycle_id");--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "files" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "notifications_org_user_read_idx" ON "notifications" USING btree ("organisation_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_org_created_idx" ON "notifications" USING btree ("organisation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedup_uidx" ON "notifications" USING btree ("organisation_id","user_id","dedup_key") WHERE dedup_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_org_status_due_idx" ON "tasks" USING btree ("organisation_id","status","due_date");--> statement-breakpoint
CREATE INDEX "tasks_org_assigned_status_idx" ON "tasks" USING btree ("organisation_id","assigned_to","status");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_ext_uidx" ON "webhook_events" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "sync_ops_org_user_applied_idx" ON "sync_ops" USING btree ("organisation_id","user_id","applied_at");