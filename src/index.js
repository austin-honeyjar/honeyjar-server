import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import csvRoutes from './routes/csv.js';

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

// CSV routes
app.use('/api/csv', csvRoutes);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}); 