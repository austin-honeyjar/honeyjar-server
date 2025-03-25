-- Create the csv_metadata table if it doesn't exist
CREATE TABLE IF NOT EXISTS csv_metadata (
    id SERIAL PRIMARY KEY,
    table_name TEXT NOT NULL UNIQUE,
    column_names TEXT[] NOT NULL,
    file_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
); 