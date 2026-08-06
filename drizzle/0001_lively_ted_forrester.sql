CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`seasonId` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`dedupeKey` text,
	`readAt` integer,
	`channel` text DEFAULT 'in_app' NOT NULL,
	`deliveredAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notification` (`userId`,`readAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_dedupe_idx` ON `notification` (`userId`,`dedupeKey`);--> statement-breakpoint
CREATE TABLE `weekly_award` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`weekNo` integer NOT NULL,
	`category` text NOT NULL,
	`membershipId` text NOT NULL,
	`teamId` text,
	`value` real,
	`note` text,
	`awardedBy` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membershipId`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`awardedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_award_unique_idx` ON `weekly_award` (`seasonId`,`weekNo`,`category`,`teamId`);--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_award_season_unique_idx` ON `weekly_award` (`seasonId`,`weekNo`,`category`) WHERE "weekly_award"."teamId" is null;--> statement-breakpoint
CREATE INDEX `weekly_award_week_idx` ON `weekly_award` (`seasonId`,`weekNo`);--> statement-breakpoint
CREATE INDEX `weekly_award_membership_idx` ON `weekly_award` (`membershipId`);