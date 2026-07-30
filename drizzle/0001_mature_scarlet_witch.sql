CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`variant` text NOT NULL,
	`unit` text NOT NULL,
	`price` real NOT NULL,
	`gwp` real,
	`density` real NOT NULL,
	`source_note` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
