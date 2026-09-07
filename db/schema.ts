import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const lunchForecasts = sqliteTable('lunch_forecasts', {
  date: text('date').primaryKey(),
  forecast: text('forecast').notNull(),
  updatedAt: text('updated_at').notNull(),
});
