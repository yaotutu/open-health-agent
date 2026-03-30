CREATE TABLE `body_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`weight` real,
	`body_fat` real,
	`bmi` real,
	`note` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_body_user_id` ON `body_records` (`user_id`);--> statement-breakpoint
CREATE TABLE `chronic_conditions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`condition` text NOT NULL,
	`severity` text,
	`seasonal_pattern` text,
	`triggers` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chronic_user_id` ON `chronic_conditions` (`user_id`);--> statement-breakpoint
CREATE TABLE `conversation_summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`summary` text NOT NULL,
	`message_count` integer,
	`start_timestamp` integer NOT NULL,
	`end_timestamp` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `summaries_user_id_idx` ON `conversation_summaries` (`user_id`);--> statement-breakpoint
CREATE TABLE `diet_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`food` text,
	`calories` real,
	`protein` real,
	`carbs` real,
	`fat` real,
	`sodium` real,
	`meal_type` text,
	`note` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_diet_user_id` ON `diet_records` (`user_id`);--> statement-breakpoint
CREATE TABLE `exercise_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`duration` integer,
	`calories` integer,
	`heart_rate_avg` integer,
	`heart_rate_max` integer,
	`distance` real,
	`note` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_exercise_user_id` ON `exercise_records` (`user_id`);--> statement-breakpoint
CREATE TABLE `health_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`tags` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_observation_user_id` ON `health_observations` (`user_id`);--> statement-breakpoint
CREATE TABLE `heartbeat_tasks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` integer NOT NULL,
	`level_name` text NOT NULL,
	`msg` text NOT NULL,
	`time` text NOT NULL,
	`data` text,
	`module` text
);
--> statement-breakpoint
CREATE INDEX `idx_logs_time` ON `logs` (`time`);--> statement-breakpoint
CREATE INDEX `idx_logs_module` ON `logs` (`module`);--> statement-breakpoint
CREATE INDEX `idx_logs_level` ON `logs` (`level`);--> statement-breakpoint
CREATE TABLE `medication_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`medication` text NOT NULL,
	`dosage` text,
	`frequency` text,
	`start_date` integer,
	`end_date` integer,
	`note` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_medication_user_id` ON `medication_records` (`user_id`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`category` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memories_user_id_idx` ON `memories` (`user_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_messages_user_id` ON `messages` (`user_id`);--> statement-breakpoint
CREATE TABLE `sleep_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`duration` integer,
	`quality` integer,
	`bed_time` integer,
	`wake_time` integer,
	`deep_sleep` integer,
	`note` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sleep_user_id` ON `sleep_records` (`user_id`);--> statement-breakpoint
CREATE TABLE `symptom_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`description` text NOT NULL,
	`severity` integer,
	`body_part` text,
	`related_type` text,
	`related_id` integer,
	`resolved_at` integer,
	`note` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_symptom_user_id` ON `symptom_records` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`height` real,
	`age` integer,
	`gender` text,
	`diseases` text,
	`allergies` text,
	`diet_preferences` text,
	`health_goal` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `water_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_water_user_id` ON `water_records` (`user_id`);