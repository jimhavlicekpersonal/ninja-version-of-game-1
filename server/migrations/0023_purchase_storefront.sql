-- Migration 0023 (re-audit): where and for how much each purchase was made.
-- Apple's signed transaction carries the storefront (country), currency and
-- price; Google's purchase carries the region. Needed for country economics
-- (actual proceeds, not catalog USD) and for Japan's prepaid-balance report.
alter table purchases add column if not exists storefront text;
alter table purchases add column if not exists currency text;
alter table purchases add column if not exists price_micros bigint;
