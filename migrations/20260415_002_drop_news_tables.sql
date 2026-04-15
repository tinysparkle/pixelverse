-- 移除热点雷达功能：删除 news_* 相关表（已从 sql/schema.sql 中移除）
-- 子表先于 news_items 删除；使用 FOREIGN_KEY_CHECKS 避免顺序问题

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS news_bookmarks;
DROP TABLE IF EXISTS news_read;
DROP TABLE IF EXISTS news_items;
DROP TABLE IF EXISTS news_keywords;
DROP TABLE IF EXISTS news_settings;

SET FOREIGN_KEY_CHECKS = 1;
