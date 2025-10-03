import { useState, useEffect } from 'react';
import { MessageLog } from '@/types';
import { config } from '@/config';

const SSE_URL = `${config.apiBaseUrl}${config.endpoints.eventsStream}`;

export const useEventSource = (shippingCode: string | null, phone: string | null) => {
  const [messages, setMessages] = useState<MessageLog[]>([]);

  useEffect(() => {
    if (!shippingCode || !phone) {
        setMessages([]);
        return;
    }

    // REAL IMPLEMENTATION - Server-Sent Events
    console.log(`SSE: Connecting to ${SSE_URL}?shipping_code=${shippingCode}`);
    const eventSource = new EventSource(`${SSE_URL}?shipping_code=${shippingCode}`);

    eventSource.onmessage = (event) => {
      try {
        const newMessage: MessageLog = JSON.parse(event.data);
        if(newMessage.direction === 'incoming') {
          setMessages((prevMessages) => [...prevMessages, newMessage]);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      eventSource.close();
    };

    return () => {
      console.log('SSE: Disconnecting from event source');
      eventSource.close();
    };

  }, [shippingCode, phone]);

  return messages;
};
