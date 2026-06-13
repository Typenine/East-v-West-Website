-- Trade block Discord webhook delivery tracking
ALTER TYPE discord_notification_type ADD VALUE IF NOT EXISTS 'trade_block_posted';
