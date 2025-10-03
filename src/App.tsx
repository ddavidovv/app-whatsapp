import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { flushSync } from 'react-dom';
import { Template, Shipment, MessageLog, Placeholder, ProviderType } from '@/types';
import { fetchTemplates, fetchShipment, sendMessage } from '@/services/api';
import { useEventSource } from '@/hooks/useEventSource';
import { PaperAirplaneIcon, UserIcon, BotIcon, Spinner } from '@/components/icons';
import { getAvailableProviders } from '@/services/providers';
import { getProviderConfig } from '@/config';

// Memoized preview component to prevent unnecessary re-renders
const MessagePreview = memo<{ selectedTemplate: Template | undefined; placeholders: Placeholder[] }>(
    ({ selectedTemplate, placeholders }) => {
        console.log('MessagePreview rendered');
        const previewText = useMemo(() => {
            console.log('previewText recalculated inside MessagePreview');
            if (!selectedTemplate) return 'Select a template and load shipment data to see a preview.';
            const bodyText = selectedTemplate.components.find(c => c.type === 'BODY')?.text || '';
            return placeholders.reduce((text, p) => {
                return text.replace(`{{${p.id}}}`, p.value ? `[${p.value}]` : `{{${p.id}}}`);
            }, bodyText);
        }, [selectedTemplate, placeholders]);

        return (
            <div className="bg-gray-100 p-4 rounded-md border border-gray-200">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{previewText}</p>
            </div>
        );
    },
    (prevProps, nextProps) => {
        // Custom comparison: only re-render if template changes or placeholder values change
        if (prevProps.selectedTemplate?.name !== nextProps.selectedTemplate?.name) return false;
        if (prevProps.placeholders.length !== nextProps.placeholders.length) return false;
        for (let i = 0; i < prevProps.placeholders.length; i++) {
            if (prevProps.placeholders[i].value !== nextProps.placeholders[i].value) return false;
        }
        return true; // Props are equal, don't re-render
    }
);

MessagePreview.displayName = 'MessagePreview';

const App: React.FC = () => {
    const scrollPositionRef = useRef<number>(0);
    const placeholderInputsRef = useRef<{ [key: number]: HTMLInputElement | null }>({});
    const availableProviders = getAvailableProviders();
    const currentProviderConfig = getProviderConfig();

    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const [selectedProvider, setSelectedProvider] = useState<ProviderType>(currentProviderConfig.type);
    const [providerTemplates, setProviderTemplates] = useState<Record<string, string[]>>(() => {
        const initial: Record<string, string[]> = {};
        availableProviders.forEach(p => {
            initial[p.id] = p.templates || [];
        });
        return initial;
    });
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
    const [shippingCode, setShippingCode] = useState<string>('ABC123XYZ');
    const [destinationPhone, setDestinationPhone] = useState<string>('+34690768879');
    const [shipmentData, setShipmentData] = useState<Shipment | null>(null);
    const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
    const [previewKey, setPreviewKey] = useState<number>(0); // Force preview update
    const [messages, setMessages] = useState<MessageLog[]>([]);
    const [isLoading, setIsLoading] = useState({ templates: false, shipment: false, sending: false });
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const sseMessages = useEventSource(shipmentData?.shipping_code || null, shipmentData?.phone || null);
    const activityFeedRef = useRef<HTMLDivElement>(null);

    const selectedTemplate = useMemo(() => templates.find(t => t.name === selectedTemplateName), [templates, selectedTemplateName]);

    const providerInfo = useMemo(() => {
        return availableProviders.find(p => p.id === selectedProvider);
    }, [selectedProvider, availableProviders]);

    useEffect(() => {
        const loadTemplates = async () => {
            setIsLoading(prev => ({ ...prev, templates: true }));
            try {
                const fetchedTemplates = await fetchTemplates(selectedProvider);
                setTemplates(fetchedTemplates);
                if (fetchedTemplates.length > 0) {
                    setSelectedTemplateName(fetchedTemplates[0].name);
                } else {
                    setSelectedTemplateName('');
                }
                // Clear messages when provider changes
                setMessages([]);
            } catch (err) {
                setError('Failed to load templates.');
            } finally {
                setIsLoading(prev => ({ ...prev, templates: false }));
            }
        };
        loadTemplates();
    }, [selectedProvider]);

    useEffect(() => {
        console.log('useEffect placeholders triggered');
        if (selectedTemplate && shipmentData) {
            const bodyComponent = selectedTemplate.components.find(c => c.type === 'BODY');
            if (bodyComponent?.text) {
                const placeholderCount = (bodyComponent.text.match(/\{\{\d+\}\}/g) || []).length;

                // Only update if the structure changed (different count or template)
                if (placeholders.length !== placeholderCount) {
                    console.log('Updating placeholders structure');
                    const newPlaceholders = Array.from({ length: placeholderCount }, (_, i) => {
                        const key = selectedTemplate.placeholderMapping?.[i] || 'custom';
                        return {
                            id: i + 1,
                            key: key,
                            value: key !== 'custom' && shipmentData ? shipmentData[key] : '',
                        };
                    });
                    setPlaceholders(newPlaceholders);
                }
            }
        } else {
            if (placeholders.length > 0) {
                console.log('Clearing placeholders');
                setPlaceholders([]);
            }
        }
    }, [selectedTemplate, shipmentData, placeholders.length]);

    useEffect(() => {
        console.log('useEffect SSE messages triggered', sseMessages.length);
        if (sseMessages.length > 0) {
            setMessages(prev => [...prev, ...sseMessages]);
        }
    }, [sseMessages]);

    const handleFetchShipment = useCallback(async () => {
        if (!shippingCode) {
            setError('Please enter a shipping code.');
            return;
        }
        setIsLoading(prev => ({ ...prev, shipment: true }));
        setError(null);
        setShipmentData(null);
        setMessages([]); // Clear messages for new shipment
        try {
            const data = await fetchShipment(shippingCode);
            setShipmentData(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            setShipmentData(null);
        } finally {
            setIsLoading(prev => ({ ...prev, shipment: false }));
        }
    }, [shippingCode]);

    const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handlePlaceholderChange = useCallback((id: number) => {
        console.log('handlePlaceholderChange called', id);

        // Clear previous timeout
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }

        // Debounce: only update state after 300ms of no typing
        updateTimeoutRef.current = setTimeout(() => {
            console.log('Updating placeholders after debounce');
            // Get current values from inputs
            const currentValues = placeholders.map(p => {
                const input = placeholderInputsRef.current[p.id];
                return {
                    ...p,
                    value: input?.value || p.value
                };
            });

            setPlaceholders(currentValues);
            setPreviewKey(prev => prev + 1);
        }, 300);
    }, [placeholders]);


    const handleSend = async () => {
        if (!selectedTemplate || !shipmentData) {
            setError('Template and shipment data are required.');
            return;
        }
        if (placeholders.some(p => !p.value)) {
            setError('All placeholders must be filled.');
            return;
        }

        setIsLoading(prev => ({ ...prev, sending: true }));
        setError(null);

        const finalMessageText = placeholders.reduce((text, p) => {
            return text.replace(`{{${p.id}}}`, p.value);
        }, selectedTemplate.components.find(c => c.type === 'BODY')?.text || '');

        // Use custom phone if provided, otherwise use shipment phone
        const phoneToUse = destinationPhone || shipmentData.phone;

        const outgoingMessage: MessageLog = {
            id: `msg_out_temp_${Date.now()}`,
            direction: 'outgoing',
            phone: phoneToUse,
            shipping_code: shipmentData.shipping_code,
            template_name: selectedTemplate.name,
            text: finalMessageText,
            status: 'sending',
            created_at: new Date().toISOString(),
        };

        setMessages(prev => [...prev, outgoingMessage]);

        try {
            const sentMessageConfirmation = await sendMessage(
                phoneToUse,
                shipmentData.shipping_code,
                selectedTemplate,
                finalMessageText,
                selectedProvider,
                placeholders
            );
            setMessages(prev => prev.map(m => m.id === outgoingMessage.id ? sentMessageConfirmation : m));
            setSuccessMessage(`Message sent successfully to ${phoneToUse} via ${selectedProvider.toUpperCase()}`);
            setTimeout(() => setSuccessMessage(null), 5000); // Clear after 5 seconds
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(errorMessage);
            setMessages(prev => prev.map(m => m.id === outgoingMessage.id ? { ...m, status: 'failed' } : m));
        } finally {
            setIsLoading(prev => ({ ...prev, sending: false }));
        }
    };
    
    const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
        <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
            {children}
        </div>
    );
    
    const MessageBubble: React.FC<{ message: MessageLog }> = ({ message }) => {
        const isOutgoing = message.direction === 'outgoing';
        const statusIndicator = {
            sending: '…',
            sent: '✓',
            delivered: '✓✓',
            read: '✓✓',
            failed: '✗',
        };
        const statusColor = {
            sending: 'text-gray-400',
            sent: 'text-gray-400',
            delivered: 'text-gray-400',
            read: 'text-blue-500',
            failed: 'text-red-500',
        };

        return (
            <div className={`flex items-start gap-3 ${isOutgoing ? 'flex-row-reverse' : ''}`}>
                <div className={`p-2 rounded-full ${isOutgoing ? 'bg-brand-red text-white' : 'bg-gray-200 text-gray-700'}`}>
                    {isOutgoing ? <BotIcon className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                </div>
                <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${isOutgoing ? 'bg-brand-red text-white' : 'bg-gray-200'}`}>
                        <p className="text-sm">{message.text}</p>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        <span>{new Date(message.created_at).toLocaleTimeString()}</span>
                        {isOutgoing && (
                            <span className={`ml-1 font-bold ${statusColor[message.status]}`}>
                                {statusIndicator[message.status]}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-gray-900">Settings</h2>
                            <button
                                onClick={() => setIsSettingsOpen(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">WhatsApp Provider</label>
                                <select
                                    value={selectedProvider}
                                    onChange={(e) => setSelectedProvider(e.target.value as ProviderType)}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-red focus:ring-brand-red text-sm"
                                >
                                    {availableProviders.map(provider => (
                                        <option key={provider.id} value={provider.id}>
                                            {provider.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {providerInfo && (
                                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                                    <p className="text-xs text-blue-800">
                                        <strong>{providerInfo.name}</strong>: {providerInfo.description}
                                    </p>
                                    <p className="text-xs text-blue-600 mt-1">
                                        Auth Type: <span className="font-mono">{providerInfo.authType}</span>
                                    </p>
                                </div>
                            )}

                            {/* Templates Configuration - Only for selected provider */}
                            {providerInfo && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Templates for {providerInfo.name}
                                    </label>
                                    <div className="border border-gray-200 rounded-md p-3">
                                        <div className="space-y-2">
                                            {(providerTemplates[selectedProvider] || []).map((template, idx) => (
                                                <div key={idx} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={template}
                                                        onChange={(e) => {
                                                            setProviderTemplates(prev => ({
                                                                ...prev,
                                                                [selectedProvider]: prev[selectedProvider].map((t, i) => i === idx ? e.target.value : t)
                                                            }));
                                                        }}
                                                        placeholder="Template name/ID"
                                                        className="flex-1 text-xs rounded-md border-gray-300 shadow-sm focus:border-brand-red focus:ring-brand-red"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            setProviderTemplates(prev => ({
                                                                ...prev,
                                                                [selectedProvider]: prev[selectedProvider].filter((_, i) => i !== idx)
                                                            }));
                                                        }}
                                                        className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                                                    >
                                                        ✗
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => {
                                                    setProviderTemplates(prev => ({
                                                        ...prev,
                                                        [selectedProvider]: [...(prev[selectedProvider] || []), '']
                                                    }));
                                                }}
                                                className="w-full px-2 py-1 text-xs text-brand-red hover:text-brand-red-dark border border-brand-red rounded-md"
                                            >
                                                + Add Template
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={async () => {
                                    try {
                                        const response = await fetch(`${config.apiBaseUrl}/api/providers/config`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ providerTemplates })
                                        });
                                        if (response.ok) {
                                            setSuccessMessage('Configuration saved successfully!');
                                            setTimeout(() => setSuccessMessage(null), 3000);
                                        } else {
                                            setError('Failed to save configuration');
                                        }
                                    } catch (err) {
                                        console.error('Save config error:', err);
                                        setError('Failed to save configuration');
                                    } finally {
                                        // Always close the modal
                                        setIsSettingsOpen(false);
                                    }
                                }}
                                className="w-full mt-4 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600"
                            >
                                Save Configuration
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className="bg-white shadow-md">
                <div className="max-w-7xl mx-auto py-3 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-brand-red">Utility Messaging Template Tester</h1>
                    <div className="flex items-center gap-3">
                        {/* Settings Icon */}
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="text-gray-600 hover:text-brand-red transition-colors"
                            title="Settings"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        <div className="w-12 h-7 bg-brand-red flex items-center justify-center text-white font-bold text-sm rounded">
                            {providerInfo?.id.substring(0, 2).toUpperCase() || 'CT'}
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
                {/* Top Configuration Bar - Compact */}
                <div className="bg-white p-4 rounded-lg shadow mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Template */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
                            {isLoading.templates ? <Spinner className="h-5 w-5 text-brand-red"/> : (
                                <select
                                    value={selectedTemplateName}
                                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-red focus:ring-brand-red text-sm"
                                >
                                    {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                                </select>
                            )}
                        </div>

                        {/* Shipment */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Shipping Code</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={shippingCode}
                                    onChange={(e) => setShippingCode(e.target.value)}
                                    placeholder="ABC123XYZ"
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-red focus:ring-brand-red text-sm"
                                />
                                <button
                                    onClick={handleFetchShipment}
                                    disabled={isLoading.shipment || !shippingCode}
                                    className="flex justify-center items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-brand-red hover:bg-brand-red-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-red disabled:bg-gray-400"
                                >
                                    {isLoading.shipment ? <Spinner className="h-4 w-4"/> : 'Load'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Destination Phone - Compact inline */}
                    <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Destination Phone <span className="text-gray-500 font-normal">(optional, defaults to shipment phone)</span>
                        </label>
                        <input
                            type="text"
                            value={destinationPhone}
                            onChange={(e) => setDestinationPhone(e.target.value)}
                            placeholder="+34690768879"
                            className="block w-full md:w-1/3 rounded-md border-gray-300 shadow-sm focus:border-brand-red focus:ring-brand-red text-sm"
                        />
                    </div>
                </div>

                {/* Middle Section: Placeholders + Preview side by side */}
                {shipmentData && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                        {/* Left: Placeholders */}
                        <div className="bg-white p-4 rounded-lg shadow">
                            <h2 className="text-sm font-semibold text-gray-900 mb-3">Fill Placeholders</h2>
                            <div className="space-y-2">
                                {placeholders.map(p => (
                                    <div key={`placeholder-${p.id}-${p.key}`}>
                                        <label className="block text-xs font-medium text-gray-700">
                                            <code className="text-brand-red">{`{{${p.id}}}`}</code> ({p.key})
                                        </label>
                                        <input
                                            ref={(el) => (placeholderInputsRef.current[p.id] = el)}
                                            type="text"
                                            defaultValue={p.value}
                                            onInput={() => handlePlaceholderChange(p.id)}
                                            autoComplete="off"
                                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-red focus:ring-brand-red text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: Preview & Send */}
                        <div className="bg-white p-4 rounded-lg shadow">
                            <h2 className="text-sm font-semibold text-gray-900 mb-3">Message Preview</h2>
                            <MessagePreview key={previewKey} selectedTemplate={selectedTemplate} placeholders={placeholders} />
                            <button
                                onClick={handleSend}
                                disabled={isLoading.sending || !shipmentData || placeholders.some(p => !p.value)}
                                className="mt-4 w-full flex justify-center items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-red hover:bg-brand-red-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-red disabled:bg-gray-400"
                            >
                                {isLoading.sending ? <Spinner className="h-4 w-4"/> : <PaperAirplaneIcon className="h-4 w-4" />}
                                Send Message
                            </button>
                            {successMessage && (
                                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-md">
                                    <p className="text-xs text-green-800 font-semibold">✓ {successMessage}</p>
                                </div>
                            )}
                            {error && (
                                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                                    <p className="text-xs text-red-800 font-semibold">✗ {error}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Bottom Section: Activity Feed - Full Width */}
                <div className="bg-white p-4 rounded-lg shadow">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">Activity Feed</h2>
                    <div ref={activityFeedRef} className="h-64 overflow-y-auto bg-white border border-gray-200 rounded-md p-4 space-y-4">
                        {messages.length > 0 ? (
                            messages.map(msg => <MessageBubble key={msg.id} message={msg} />)
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-gray-500 text-sm">No activity yet. Send a message to begin.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
