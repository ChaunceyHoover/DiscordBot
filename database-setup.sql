DROP TABLE IF EXISTS `Voted`;

CREATE TABLE `Voted` (
	`Id` INT PRIMARY KEY AUTO_INCREMENT,
	`UserId` VARCHAR(255) NOT NULL,
	`MessageId` VARCHAR(255) NOT NULL,
	`ChannelId` VARCHAR(255) NOT NULL,
	`GuildId` VARCHAR(255) NOT NULL,
	`Time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`Yay` TINYINT UNSIGNED NOT NULL,
	`Nay` TINYINT UNSIGNED NOT NULL
) Engine=InnoDB, COMMENT='Stores messages that have been previously voted so they won\'t be voted on again.';