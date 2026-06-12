CREATE TABLE `label` (
		`id` text PRIMARY KEY,
		`name` text NOT NULL,
		`time_created` integer NOT NULL,
		`time_updated` integer NOT NULL
	);
--> statement-breakpoint
CREATE TABLE `session_label` (
		`session_id` text NOT NULL,
		`label_id` text NOT NULL,
		`time_created` integer NOT NULL,
		`time_updated` integer NOT NULL,
		CONSTRAINT `session_label_session_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
		CONSTRAINT `session_label_label_fk` FOREIGN KEY (`label_id`) REFERENCES `label`(`id`) ON DELETE CASCADE
	);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_label_session_idx` ON `session_label` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_label_label_session_idx` ON `session_label` (`label_id`, `session_id`);
