CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE UNIQUE INDEX "one_pending_booking_per_user" ON "Booking" ("userId") WHERE status = 'PENDING';
CREATE UNIQUE INDEX "one_active_session_per_table" ON "Session" ("tableId") WHERE status IN ('OPEN', 'STOPPED');
ALTER TABLE "Booking" ADD CONSTRAINT "non_overlapping_pending_bookings"
  EXCLUDE USING gist ("tableId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&) WHERE (status = 'PENDING');
ALTER TABLE "Booking" ADD CONSTRAINT "positive_booking_duration" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Voucher" ADD CONSTRAINT "voucher_usage_bounds" CHECK ("usedCount" >= 0 AND "usedCount" <= "usageLimit");
ALTER TABLE "Invoice" ADD CONSTRAINT "invoice_balances" CHECK ("total" = "play" + "services" - "discount" AND "total" >= 0 AND "tendered" >= "total" AND "change" = "tendered" - "total");
ALTER TABLE "SessionItem" ADD CONSTRAINT "item_bounds" CHECK ("quantity" BETWEEN 1 AND 99 AND "price" >= 0);
