import { Request, Response } from 'express';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';

interface ChatRequest extends Request {
  body: {
    input_value: string;
    output_type: string;
    input_type: string;
  }
}

export const chatHandler = async (req: ChatRequest, res: Response): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Health check first
    const testResponse = await axios.get(
      `https://api.langflow.astra.datastax.com/health`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`
        }
      }
    );
    console.log('Health check response:', testResponse.status);

    const apiUrl = `https://api.langflow.astra.datastax.com/lf/${process.env.REACT_APP_LANGFLOW_ID}/api/v1/run/${process.env.REACT_APP_FLOW_ID}`;
    
    const axiosConfig: AxiosRequestConfig = {
      method: 'post',
      url: apiUrl,
      data: req.body,
      headers: {
        'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': req.headers.origin || 'http://localhost:3000',
        'Referer': req.headers.referer || 'http://localhost:3000/',
        'Host': 'api.langflow.astra.datastax.com'
      },
      validateStatus: (status: number) => status < 500
    };

    console.log('Making request with config:', {
      url: apiUrl,
      method: 'POST',
      headers: {
        ...axiosConfig.headers,
        'Authorization': 'Bearer [HIDDEN]'
      }
    });

    const response = await axios(axiosConfig);
    
    if (response.status !== 200) {
      console.warn('API returned non-200 status:', response.status, response.data);
    }

    return res.status(response.status).json(response.data);

  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('API Error:', {
      message: axiosError.message,
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      config: {
        url: axiosError.config?.url,
        method: axiosError.config?.method,
        headers: {
          ...axiosError.config?.headers,
          Authorization: 'Bearer [HIDDEN]'
        }
      }
    });

    return res.status(axiosError.response?.status || 500).json({
      error: 'API request failed',
      message: axiosError.message,
      details: axiosError.response?.data || 'No additional details available'
    });
  }
}; 