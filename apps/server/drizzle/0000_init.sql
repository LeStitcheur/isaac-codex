CREATE TABLE `achievements` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`requirement` text NOT NULL,
	`requirement_text` text NOT NULL,
	`mask` integer NOT NULL,
	`kind` text NOT NULL,
	`character_slug` text,
	`coins` integer,
	`challenge_number` integer,
	`reward_kind` text NOT NULL,
	`reward_key` text,
	`reward_label` text NOT NULL,
	`difficulty` integer NOT NULL,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `achievements_character_idx` ON `achievements` (`character_slug`);--> statement-breakpoint
CREATE INDEX `achievements_kind_idx` ON `achievements` (`kind`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bosses` (
	`slug` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text,
	`type` text NOT NULL,
	`entity_id` integer,
	`variant` integer,
	`hp` real,
	`floors` text NOT NULL,
	`rewards` text,
	`behavior` text,
	`notes` text,
	`strategy` text,
	`unlock_achievement_id` integer,
	`mask` integer NOT NULL,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`number` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`description` text NOT NULL,
	`character_slug` text,
	`unlock_achievement_id` integer,
	`reward_achievement_id` integer,
	`mask` integer NOT NULL,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `character_starting_items` (
	`character_slug` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_key` text NOT NULL,
	`sort` integer NOT NULL,
	PRIMARY KEY(`character_slug`, `entity_kind`, `entity_key`),
	FOREIGN KEY (`character_slug`) REFERENCES `characters`(`slug`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_stats` (
	`character_slug` text PRIMARY KEY NOT NULL,
	`health` text NOT NULL,
	`damage` text,
	`tears` text,
	`speed` text,
	`range` text,
	`shot_speed` text,
	`luck` text,
	FOREIGN KEY (`character_slug`) REFERENCES `characters`(`slug`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_unlock_marks` (
	`achievement_id` integer NOT NULL,
	`mark_key` text NOT NULL,
	PRIMARY KEY(`achievement_id`, `mark_key`),
	FOREIGN KEY (`achievement_id`) REFERENCES `character_unlocks`(`achievement_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mark_key`) REFERENCES `completion_marks`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `character_unlocks` (
	`achievement_id` integer PRIMARY KEY NOT NULL,
	`character_slug` text NOT NULL,
	`hard` integer NOT NULL,
	FOREIGN KEY (`achievement_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_slug`) REFERENCES `characters`(`slug`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_unlocks_character_idx` ON `character_unlocks` (`character_slug`);--> statement-breakpoint
CREATE TABLE `characters` (
	`slug` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text,
	`tainted` integer NOT NULL,
	`base_slug` text,
	`sort` integer NOT NULL,
	`forms` text NOT NULL,
	`pickups` text,
	`starting_text` text,
	`unlock_achievement_id` integer,
	`mask` integer NOT NULL,
	`notes` text,
	`strategy` text,
	`editorial` text,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `completion_marks` (
	`key` text PRIMARY KEY NOT NULL,
	`sort` integer NOT NULL,
	`name_fr` text NOT NULL,
	`name_en` text NOT NULL,
	`boss` text NOT NULL,
	`hard_label_fr` text NOT NULL,
	`mask` integer NOT NULL,
	`description` text NOT NULL,
	`access_achievement_ids` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consumables` (
	`slug` text PRIMARY KEY NOT NULL,
	`game_id` integer,
	`kind` text NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text,
	`quote` text,
	`description` text NOT NULL,
	`horse_effect` text,
	`polarity` text,
	`unlock_achievement_id` integer,
	`mask` integer NOT NULL,
	`effects` text,
	`notes` text,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consumables_kind_idx` ON `consumables` (`kind`);--> statement-breakpoint
CREATE TABLE `donation_milestones` (
	`machine` text NOT NULL,
	`coins` integer NOT NULL,
	`achievement_id` integer NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`machine`, `coins`),
	FOREIGN KEY (`achievement_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `floor_routes` (
	`slug` text PRIMARY KEY NOT NULL,
	`sort` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `floors` (
	`slug` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text,
	`chapter` integer NOT NULL,
	`alternate` integer NOT NULL,
	`mask` integer NOT NULL,
	`unlock_achievement_id` integer,
	`bosses` text NOT NULL,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_versions` (
	`key` text PRIMARY KEY NOT NULL,
	`bit` integer NOT NULL,
	`label` text NOT NULL,
	`sort` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_versions_bit_unique` ON `game_versions` (`bit`);--> statement-breakpoint
CREATE TABLE `guide_steps` (
	`guide_slug` text NOT NULL,
	`step_index` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`guide_slug`, `step_index`),
	FOREIGN KEY (`guide_slug`) REFERENCES `guides`(`slug`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `guides` (
	`slug` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`level` text NOT NULL,
	`priority` integer NOT NULL,
	`summary` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item_pool_entries` (
	`item_id` integer NOT NULL,
	`pool_key` text NOT NULL,
	`weight` real NOT NULL,
	`mask` integer NOT NULL,
	PRIMARY KEY(`item_id`, `pool_key`, `mask`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_pool_entries_pool_idx` ON `item_pool_entries` (`pool_key`);--> statement-breakpoint
CREATE TABLE `item_pools` (
	`key` text PRIMARY KEY NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text,
	`greed` integer NOT NULL,
	`mask` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item_synergies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`a_kind` text NOT NULL,
	`a_key` text NOT NULL,
	`b_kind` text NOT NULL,
	`b_key` text NOT NULL,
	`section` text NOT NULL,
	`text` text NOT NULL,
	`possibly_negative` integer NOT NULL,
	`mask` integer,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `item_synergies_a_idx` ON `item_synergies` (`a_kind`,`a_key`);--> statement-breakpoint
CREATE INDEX `item_synergies_b_idx` ON `item_synergies` (`b_kind`,`b_key`);--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`item_id`, `tag`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_tags_tag_idx` ON `item_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`familiar` integer NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text,
	`quote` text,
	`description` text NOT NULL,
	`quality` integer,
	`quality_rep_plus` integer,
	`recharge` text,
	`unlock_achievement_id` integer,
	`mask` integer NOT NULL,
	`effects` text,
	`notes` text,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `items_quality_idx` ON `items` (`quality`);--> statement-breakpoint
CREATE INDEX `items_kind_idx` ON `items` (`kind`);--> statement-breakpoint
CREATE INDEX `items_name_idx` ON `items` (`name_en`);--> statement-breakpoint
CREATE TABLE `planner_paths` (
	`slug` text PRIMARY KEY NOT NULL,
	`sort` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile_completion_marks` (
	`profile_id` text NOT NULL,
	`character_slug` text NOT NULL,
	`mark_key` text NOT NULL,
	`difficulty` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `character_slug`, `mark_key`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_donations` (
	`profile_id` text NOT NULL,
	`machine` text NOT NULL,
	`coins` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `machine`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_favorites` (
	`profile_id` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_key` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `entity_kind`, `entity_key`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_history` (
	`profile_id` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_key` text NOT NULL,
	`viewed_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `entity_kind`, `entity_key`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_history_viewed_idx` ON `profile_history` (`profile_id`,`viewed_at`);--> statement-breakpoint
CREATE TABLE `profile_items` (
	`profile_id` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_key` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `entity_kind`, `entity_key`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_settings` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profile_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_tokens_profile_idx` ON `profile_tokens` (`profile_id`);--> statement-breakpoint
CREATE TABLE `profile_unlocks` (
	`profile_id` text NOT NULL,
	`achievement_id` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `achievement_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`password_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_key_idx` ON `profiles` (`name_key`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`license` text NOT NULL,
	`license_url` text NOT NULL,
	`fetched_at` text NOT NULL,
	`method` text NOT NULL,
	`dataset_version` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transformation_requirements` (
	`transformation_slug` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_key` text NOT NULL,
	PRIMARY KEY(`transformation_slug`, `entity_kind`, `entity_key`),
	FOREIGN KEY (`transformation_slug`) REFERENCES `transformations`(`slug`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transformation_requirements_entity_idx` ON `transformation_requirements` (`entity_kind`,`entity_key`);--> statement-breakpoint
CREATE TABLE `transformations` (
	`slug` text PRIMARY KEY NOT NULL,
	`id` integer NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text,
	`description` text NOT NULL,
	`requirement` text NOT NULL,
	`members_text` text NOT NULL,
	`mask` integer NOT NULL,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`entity_kind` text NOT NULL,
	`entity_key` text NOT NULL,
	`field` text NOT NULL,
	`lang` text NOT NULL,
	`value` text NOT NULL,
	`source` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`entity_kind`, `entity_key`, `field`, `lang`)
);
--> statement-breakpoint
CREATE TABLE `trinkets` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_en` text NOT NULL,
	`name_fr` text,
	`quote` text,
	`description` text NOT NULL,
	`tags` text NOT NULL,
	`unlock_achievement_id` integer,
	`mask` integer NOT NULL,
	`effects` text,
	`notes` text,
	`source_page` text,
	`source_revid` integer,
	`verified_at` text NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `unlock_conditions` (
	`achievement_id` integer PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`character_slug` text,
	`coins` integer,
	`challenge_number` integer,
	`text` text NOT NULL,
	FOREIGN KEY (`achievement_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `unlock_dependencies` (
	`achievement_id` integer NOT NULL,
	`requires_id` integer NOT NULL,
	PRIMARY KEY(`achievement_id`, `requires_id`),
	FOREIGN KEY (`achievement_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requires_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `unlock_dependencies_requires_idx` ON `unlock_dependencies` (`requires_id`);