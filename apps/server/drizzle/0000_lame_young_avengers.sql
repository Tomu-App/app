CREATE TABLE `docs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ops` (
	`doc_id` text NOT NULL,
	`seq` integer NOT NULL,
	`op_id` text NOT NULL,
	`envelope` text NOT NULL,
	`received_at` integer NOT NULL,
	PRIMARY KEY(`doc_id`, `seq`),
	FOREIGN KEY (`doc_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ops_doc_op_id` ON `ops` (`doc_id`,`op_id`);