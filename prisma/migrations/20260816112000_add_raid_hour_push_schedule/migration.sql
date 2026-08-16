ALTER TABLE "PushSubscription" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Europe/London';
ALTER TABLE "PushSubscription" ADD COLUMN "lastRaidHourReminderKey" TEXT;
