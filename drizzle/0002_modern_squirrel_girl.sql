CREATE TABLE `penalty` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`membershipId` text NOT NULL,
	`points` real NOT NULL,
	`reason` text,
	`issuedBy` text,
	`issuedAt` integer NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membershipId`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issuedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `penalty_season_idx` ON `penalty` (`seasonId`);--> statement-breakpoint
CREATE INDEX `penalty_membership_idx` ON `penalty` (`membershipId`);