export interface CsvMetadata {
  table_name: string;
  column_names: string[];
  file_name: string;
  created_at: Date;
}

export interface CsvTableData extends CsvMetadata {
  data: Record<string, string>[];
}

export interface CreateTableRequest {
  tableName: string;
  columns: string[];
  data: string[][];
} 