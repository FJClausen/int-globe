-- INT Globe — run once against your Azure SQL Database

CREATE TABLE pins (
    id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    pin_type    NVARCHAR(20)  NOT NULL CHECK (pin_type IN ('personal','mission')),
    title       NVARCHAR(200) NOT NULL,
    story       NVARCHAR(MAX) NULL,
    lat         DECIMAL(9,6)  NOT NULL,
    lng         DECIMAL(9,6)  NOT NULL,
    country     NVARCHAR(100) NULL,
    author_id   NVARCHAR(200) NOT NULL,
    author_name NVARCHAR(200) NULL,
    created_at  DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at  DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX idx_pins_type    ON pins (pin_type);
CREATE INDEX idx_pins_author  ON pins (author_id);
CREATE INDEX idx_pins_created ON pins (created_at DESC);
