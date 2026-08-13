CREATE TABLE `user_avatar` (
	`userId` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `passwordHash` text;--> statement-breakpoint
ALTER TABLE `user` ADD `passwordFailedAttempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `passwordLockedUntil` integer;