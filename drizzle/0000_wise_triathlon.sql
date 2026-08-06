CREATE TABLE `account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`emailVerified` integer,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
--> statement-breakpoint
CREATE TABLE `meeting` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`meetsOn` text NOT NULL,
	`startsAt` integer NOT NULL,
	`lateAfterMinutes` real DEFAULT 0 NOT NULL,
	`label` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meeting_season_date_idx` ON `meeting` (`seasonId`,`meetsOn`);--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_season_meets_on_idx` ON `meeting` (`seasonId`,`meetsOn`);--> statement-breakpoint
CREATE TABLE `membership` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`teamId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`position` text,
	`joinedAt` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teamId`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_season_user_idx` ON `membership` (`seasonId`,`userId`);--> statement-breakpoint
CREATE INDEX `membership_team_idx` ON `membership` (`teamId`);--> statement-breakpoint
CREATE TABLE `season` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`startsOn` text NOT NULL,
	`endsOn` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`formula` text DEFAULT 'weighted' NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`name` text NOT NULL,
	`abbr` text NOT NULL,
	`color` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `team_season_idx` ON `team` (`seasonId`);--> statement-breakpoint
CREATE TABLE `metric_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`metricId` text NOT NULL,
	`membershipId` text NOT NULL,
	`meetingId` text,
	`value` real NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source` text DEFAULT 'self' NOT NULL,
	`recordedBy` text,
	`recordedAt` integer NOT NULL,
	`decidedBy` text,
	`decidedAt` integer,
	`note` text,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`metricId`) REFERENCES `metric`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membershipId`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meetingId`) REFERENCES `meeting`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recordedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decidedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `entry_season_metric_idx` ON `metric_entry` (`seasonId`,`metricId`);--> statement-breakpoint
CREATE INDEX `entry_membership_idx` ON `metric_entry` (`membershipId`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_unique_idx` ON `metric_entry` (`membershipId`,`metricId`,`meetingId`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_unique_no_meeting_idx` ON `metric_entry` (`membershipId`,`metricId`) WHERE "metric_entry"."meetingId" is null;--> statement-breakpoint
CREATE TABLE `metric` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`weight` real DEFAULT 0 NOT NULL,
	`target` real,
	`required` integer DEFAULT false NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metric_season_key_idx` ON `metric` (`seasonId`,`key`);--> statement-breakpoint
CREATE TABLE `badge` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text,
	`key` text NOT NULL,
	`icon` text NOT NULL,
	`name` text NOT NULL,
	`requirementText` text NOT NULL,
	`ruleJson` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `badge_key_unique` ON `badge` (`key`);--> statement-breakpoint
CREATE INDEX `badge_season_idx` ON `badge` (`seasonId`);--> statement-breakpoint
CREATE TABLE `member_badge` (
	`id` text PRIMARY KEY NOT NULL,
	`membershipId` text NOT NULL,
	`badgeId` text NOT NULL,
	`seasonId` text NOT NULL,
	`awardedAt` integer NOT NULL,
	FOREIGN KEY (`membershipId`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`badgeId`) REFERENCES `badge`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_badge_unique_idx` ON `member_badge` (`membershipId`,`badgeId`);--> statement-breakpoint
CREATE INDEX `member_badge_membership_idx` ON `member_badge` (`membershipId`);--> statement-breakpoint
CREATE TABLE `score_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`seasonId` text NOT NULL,
	`membershipId` text NOT NULL,
	`weekNo` integer NOT NULL,
	`score` real NOT NULL,
	`rank` integer NOT NULL,
	`prevRank` integer,
	`breakdownJson` text,
	`computedAt` integer NOT NULL,
	FOREIGN KEY (`seasonId`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`membershipId`) REFERENCES `membership`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshot_unique_idx` ON `score_snapshot` (`seasonId`,`membershipId`,`weekNo`);--> statement-breakpoint
CREATE INDEX `snapshot_week_idx` ON `score_snapshot` (`seasonId`,`weekNo`);