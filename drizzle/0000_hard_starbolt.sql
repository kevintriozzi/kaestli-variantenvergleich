CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_pairs` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`requested_name` text NOT NULL,
	`requested_variant` text NOT NULL,
	`alternative_name` text NOT NULL,
	`alternative_variant` text NOT NULL,
	`unit` text NOT NULL,
	`requested_price` real NOT NULL,
	`alternative_price` real NOT NULL,
	`requested_gwp` real NOT NULL,
	`alternative_gwp` real NOT NULL,
	`density` real NOT NULL,
	`source_note` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
