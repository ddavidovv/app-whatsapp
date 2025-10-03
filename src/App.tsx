import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Template, Shipment, MessageLog, Placeholder, ProviderType } from '@/types';
import { fetchTemplates, fetchShipment, sendMessage } from '@/services/api';
import { useEventSource } from '@/hooks/useEventSource';
import { PaperAirplaneIcon, UserIcon, BotIcon, Spinner, CheckIcon, DoubleCheckIcon, ClockIcon, XCircleIcon, SettingsIcon } from '@/components/icons';
import { getAvailableProviders } from '@/services/providers';
import { getProviderConfig, config } from '@/config';

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
            <div className="bg-whatsapp-pattern p-5 rounded-2xl border border-neutral-200 shadow-inner-soft">
                <div className="bg-white p-4 rounded-xl shadow-soft">
                    <p className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">{previewText}</p>
                </div>
            </div>
        );
    },
    (prevProps, nextProps) => {
        if (prevProps.selectedTemplate?.name !== nextProps.selectedTemplate?.name) return false;
        if (prevProps.placeholders.length !== nextProps.placeholders.length) return false;
        for (let i = 0; i < prevProps.placeholders.length; i++) {
            if (prevProps.placeholders[i].value !== nextProps.placeholders[i].value) return false;
        }
        return true;
    }
);

MessagePreview.displayName = 'MessagePreview';

const App: React.FC = () => {
    const placeholderInputsRef = useRef<{ [key: number]: HTMLInputElement | null }>({});
    const availableProviders = getAvailableProviders();
    const currentProviderConfig = getProviderConfig();

    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const [selectedProvider, setSelectedProvider] = useState<ProviderType>(currentProviderConfig.type);
    const [providerTemplates, setProviderTemplates] = useState<Record<string, string[]>>(() => {
        const initial: Record<string, string[]> = {};
        availableProviders.forEach(p => {
            initial[p.id] = [];
        });
        return initial;
    });
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');
    const [shippingCode, setShippingCode] = useState<string>('ABC123XYZ');
    const [destinationPhone, setDestinationPhone] = useState<string>('+34690768879');
    const [shipmentData, setShipmentData] = useState<Shipment | null>(null);
    const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
    const [previewKey, setPreviewKey] = useState<number>(0);
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
        setMessages([]);
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

    const updateTimeoutRef = useRef<number | null>(null);

    const handlePlaceholderChange = useCallback((id: number) => {
        console.log('handlePlaceholderChange called', id);

        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }

        updateTimeoutRef.current = window.setTimeout(() => {
            console.log('Updating placeholders after debounce');
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
            setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(errorMessage);
            setMessages(prev => prev.map(m => m.id === outgoingMessage.id ? { ...m, status: 'failed' } : m));
        } finally {
            setIsLoading(prev => ({ ...prev, sending: false }));
        }
    };

    const MessageBubble: React.FC<{ message: MessageLog }> = ({ message }) => {
        const isOutgoing = message.direction === 'outgoing';

        const StatusIcon = () => {
            switch (message.status) {
                case 'sending':
                    return <ClockIcon className="w-3.5 h-3.5 text-neutral-400" />;
                case 'sent':
                    return <CheckIcon className="w-3.5 h-3.5 text-neutral-400" />;
                case 'delivered':
                    return <DoubleCheckIcon className="w-3.5 h-3.5 text-neutral-400" />;
                case 'read':
                    return <DoubleCheckIcon className="w-3.5 h-3.5 text-blue-500" />;
                case 'failed':
                    return <XCircleIcon className="w-3.5 h-3.5 text-red-500" />;
                default:
                    return null;
            }
        };

        return (
            <div className={`flex items-start gap-3 animate-slide-up ${isOutgoing ? 'flex-row-reverse' : ''}`}>
                <div className={`p-2.5 rounded-full shadow-soft transition-all duration-200 hover:scale-110 ${isOutgoing ? 'bg-gradient-to-br from-brand-red-800 to-brand-red-900 text-white' : 'bg-gradient-to-br from-whatsapp-500 to-whatsapp-600 text-white'}`}>
                    {isOutgoing ? <BotIcon className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                </div>
                <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-xs md:max-w-md p-4 rounded-2xl shadow-soft transition-all duration-200 hover:shadow-soft-lg ${isOutgoing ? 'bg-brand-red-800 text-white rounded-tr-sm' : 'bg-white text-neutral-800 rounded-tl-sm border border-neutral-200'}`}>
                        <p className="text-sm leading-relaxed">{message.text}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1.5 px-1">
                        <span>{new Date(message.created_at).toLocaleTimeString()}</span>
                        {isOutgoing && <StatusIcon />}
                    </div>
                </div>
            </div>
        );
    };

    const getProviderColor = (providerId: string) => {
        const colors: Record<string, string> = {
            'linkmobility': 'from-blue-500 to-blue-600',
            'meta': 'from-purple-500 to-purple-600',
            'salesforce': 'from-sky-500 to-sky-600',
            'broker_ctt': 'from-orange-500 to-orange-600',
            'aunoa': 'from-emerald-500 to-emerald-600',
        };
        return colors[providerId] || 'from-gray-500 to-gray-600';
    };

    const getProviderInitials = (providerId: string) => {
        const initials: Record<string, string> = {
            'linkmobility': 'LM',
            'meta': 'MT',
            'salesforce': 'SF',
            'broker_ctt': 'CT',
            'aunoa': 'AU',
        };
        return initials[providerId] || 'PR';
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100 font-sans text-neutral-800">
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-soft-2xl max-w-md w-full p-6 animate-scale-in">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-neutral-900 tracking-tight">Settings</h2>
                            <button
                                onClick={() => setIsSettingsOpen(false)}
                                className="text-neutral-400 hover:text-neutral-600 transition-colors duration-200 hover:rotate-90 transform"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                            <div>
                                <label className="block text-xs font-semibold text-neutral-700 mb-2 uppercase tracking-wider">WhatsApp Provider</label>
                                <select
                                    value={selectedProvider}
                                    onChange={(e) => setSelectedProvider(e.target.value as ProviderType)}
                                    className="block w-full rounded-lg border-neutral-300 shadow-soft focus:border-brand-red-800 focus:ring-2 focus:ring-brand-red-200 text-sm transition-all duration-200 hover:border-neutral-400"
                                >
                                    {availableProviders.map(provider => (
                                        <option key={provider.id} value={provider.id}>
                                            {provider.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {providerInfo && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 animate-slide-up">
                                    <p className="text-xs text-blue-800">
                                        <strong>{providerInfo.name}</strong>: {providerInfo.description}
                                    </p>
                                    <p className="text-xs text-blue-600 mt-1">
                                        Auth Type: <span className="font-mono">{providerInfo.authType}</span>
                                    </p>
                                </div>
                            )}

                            {providerInfo && (
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 mb-2 uppercase tracking-wider">
                                        Templates for {providerInfo.name}
                                    </label>
                                    <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50">
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
                                                        className="flex-1 text-xs rounded-lg border-neutral-300 shadow-soft focus:border-brand-red-800 focus:ring-2 focus:ring-brand-red-200 transition-all duration-200"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            setProviderTemplates(prev => ({
                                                                ...prev,
                                                                [selectedProvider]: prev[selectedProvider].filter((_, i) => i !== idx)
                                                            }));
                                                        }}
                                                        className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-all duration-200"
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
                                                className="w-full px-2 py-2 text-xs font-medium text-brand-red-800 hover:text-brand-red-900 hover:bg-brand-red-50 border border-brand-red-300 rounded-lg transition-all duration-200"
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
                                        setIsSettingsOpen(false);
                                    }
                                }}
                                className="w-full mt-4 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm font-semibold rounded-lg hover:from-green-700 hover:to-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 shadow-soft hover:shadow-soft-lg transform hover:-translate-y-0.5 transition-all duration-200"
                            >
                                Save Configuration
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <header className="bg-white shadow-soft border-b border-neutral-200">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-red-800 to-brand-red-900 bg-clip-text text-transparent tracking-tight">Utility Messaging Template Tester</h1>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="text-neutral-600 hover:text-brand-red-800 transition-all duration-200 hover:rotate-45 transform p-2 hover:bg-neutral-100 rounded-lg"
                            title="Settings"
                        >
                            <SettingsIcon className="w-6 h-6" />
                        </button>
                        <div className={`px-3 py-1.5 bg-gradient-to-br ${getProviderColor(selectedProvider)} flex items-center justify-center text-white font-bold text-xs rounded-lg shadow-soft`}>
                            {getProviderInitials(selectedProvider)}
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                {/* Provider Selection with Tags */}
                <div className="bg-white p-6 rounded-xl shadow-soft hover:shadow-soft-lg transition-all duration-300 mb-6">
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wider">Select Provider</label>
                        <div className="flex flex-wrap gap-3">
                            {availableProviders.map(provider => (
                                <button
                                    key={provider.id}
                                    onClick={() => setSelectedProvider(provider.id)}
                                    className={`
                                        group relative px-5 py-3 rounded-xl font-semibold text-sm
                                        transition-all duration-200 transform hover:scale-105
                                        ${selectedProvider === provider.id
                                            ? `bg-gradient-to-br ${getProviderColor(provider.id)} text-white shadow-soft-lg`
                                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 shadow-soft'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`
                                            w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
                                            ${selectedProvider === provider.id
                                                ? 'bg-white bg-opacity-20'
                                                : 'bg-white'
                                            }
                                        `}>
                                            {getProviderInitials(provider.id)}
                                        </span>
                                        <span>{provider.name}</span>
                                    </div>
                                    {selectedProvider === provider.id && (
                                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-soft">
                                            <CheckIcon className="w-3 h-3 text-green-600" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Template Selection with Tags */}
                    <div className="mt-6 pt-6 border-t border-neutral-200">
                        <label className="block text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wider">
                            Select Template
                            {isLoading.templates && <Spinner className="inline-block ml-2 h-4 w-4 text-brand-red-800"/>}
                        </label>
                        {templates.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {templates.map(template => (
                                    <button
                                        key={template.name}
                                        onClick={() => setSelectedTemplateName(template.name)}
                                        className={`
                                            relative px-4 py-2.5 rounded-lg font-medium text-xs
                                            transition-all duration-200 transform hover:scale-105
                                            ${selectedTemplateName === template.name
                                                ? 'bg-gradient-to-r from-brand-red-800 to-brand-red-900 text-white shadow-soft'
                                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                            }
                                        `}
                                    >
                                        <div className="flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                            </svg>
                                            <span className="truncate max-w-[200px]">{template.name}</span>
                                        </div>
                                        {selectedTemplateName === template.name && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-neutral-500 py-4 text-center bg-neutral-50 rounded-lg border-2 border-dashed border-neutral-200">
                                {isLoading.templates ? 'Loading templates...' : 'No templates available for this provider'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Shipment & Phone Section */}
                <div className="bg-white p-6 rounded-xl shadow-soft hover:shadow-soft-lg transition-all duration-300 mb-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wider">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                                Shipping Code
                            </label>
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    value={shippingCode}
                                    onChange={(e) => setShippingCode(e.target.value)}
                                    placeholder="ABC123XYZ"
                                    className="flex-1 px-4 py-3 rounded-lg border-neutral-300 shadow-soft focus:border-brand-red-800 focus:ring-2 focus:ring-brand-red-200 text-sm transition-all duration-200 hover:border-neutral-400 bg-white font-mono"
                                />
                                <button
                                    onClick={handleFetchShipment}
                                    disabled={isLoading.shipment || !shippingCode}
                                    className="flex justify-center items-center px-5 py-3 border border-transparent text-xs font-semibold rounded-lg shadow-soft text-white bg-gradient-to-r from-brand-red-800 to-brand-red-900 hover:from-brand-red-900 hover:to-brand-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-red-800 disabled:from-neutral-300 disabled:to-neutral-400 disabled:cursor-not-allowed transform hover:-translate-y-0.5 transition-all duration-200"
                                >
                                    {isLoading.shipment ? <Spinner className="h-4 w-4"/> : (
                                        <>
                                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            Load
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wider">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                Destination Phone
                                <span className="text-neutral-500 font-normal normal-case tracking-normal text-xs">(optional)</span>
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <span className="text-neutral-500 text-sm font-semibold">+</span>
                                </div>
                                <input
                                    type="tel"
                                    value={destinationPhone}
                                    onChange={(e) => setDestinationPhone(e.target.value)}
                                    placeholder="34690768879"
                                    className="w-full pl-8 pr-4 py-3 rounded-lg border-neutral-300 shadow-soft focus:border-brand-red-800 focus:ring-2 focus:ring-brand-red-200 text-sm transition-all duration-200 hover:border-neutral-400 bg-white font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {shipmentData && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="bg-white p-6 rounded-xl shadow-soft hover:shadow-soft-lg transition-all duration-300">
                            <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900 mb-5 tracking-tight">
                                <svg className="w-5 h-5 text-brand-red-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Fill Placeholders
                            </h2>
                            <div className="space-y-3">
                                {placeholders.map(p => (
                                    <div key={`placeholder-${p.id}-${p.key}`}>
                                        <label className="block text-xs font-semibold text-neutral-700 mb-2">
                                            <code className="bg-brand-red-100 text-brand-red-800 px-2 py-1 rounded-md font-mono text-xs mr-2">{`{{${p.id}}}`}</code>
                                            <span className="text-neutral-500 font-normal">({p.key})</span>
                                        </label>
                                        <input
                                            ref={(el) => (placeholderInputsRef.current[p.id] = el)}
                                            type="text"
                                            defaultValue={p.value}
                                            onInput={() => handlePlaceholderChange(p.id)}
                                            autoComplete="off"
                                            className="block w-full px-4 py-2.5 rounded-lg border-neutral-300 shadow-soft focus:border-brand-red-800 focus:ring-2 focus:ring-brand-red-200 text-sm transition-all duration-200 hover:border-neutral-400 bg-white"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-soft hover:shadow-soft-lg transition-all duration-300">
                            <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900 mb-5 tracking-tight">
                                <svg className="w-5 h-5 text-brand-red-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                Message Preview
                            </h2>
                            <MessagePreview key={previewKey} selectedTemplate={selectedTemplate} placeholders={placeholders} />
                            <button
                                onClick={handleSend}
                                disabled={isLoading.sending || !shipmentData || placeholders.some(p => !p.value)}
                                className="mt-6 w-full flex justify-center items-center gap-2 px-6 py-3.5 border border-transparent text-sm font-semibold rounded-xl shadow-soft text-white bg-gradient-to-r from-brand-red-800 to-brand-red-900 hover:from-brand-red-900 hover:to-brand-red-900 hover:shadow-soft-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-red-800 disabled:from-neutral-300 disabled:to-neutral-400 disabled:cursor-not-allowed transform hover:-translate-y-1 transition-all duration-200"
                            >
                                {isLoading.sending ? <Spinner className="h-5 w-5"/> : <PaperAirplaneIcon className="h-5 w-5" />}
                                Send Message
                            </button>
                            {successMessage && (
                                <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-green-100 border border-green-300 rounded-xl shadow-soft animate-slide-up">
                                    <div className="flex items-center gap-2">
                                        <CheckIcon className="w-4 h-4 text-green-700" />
                                        <p className="text-sm text-green-800 font-semibold">{successMessage}</p>
                                    </div>
                                </div>
                            )}
                            {error && (
                                <div className="mt-4 p-3 bg-gradient-to-r from-red-50 to-red-100 border border-red-300 rounded-xl shadow-soft animate-slide-up">
                                    <div className="flex items-center gap-2">
                                        <XCircleIcon className="w-4 h-4 text-red-700" />
                                        <p className="text-sm text-red-800 font-semibold">{error}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="bg-white p-6 rounded-xl shadow-soft hover:shadow-soft-lg transition-all duration-300">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900 mb-5 tracking-tight">
                        <svg className="w-5 h-5 text-brand-red-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        Activity Feed
                    </h2>
                    <div ref={activityFeedRef} className="h-96 overflow-y-auto bg-whatsapp-pattern border border-neutral-200 rounded-xl p-6 space-y-4 shadow-inner-soft">
                        {messages.length > 0 ? (
                            messages.map(msg => <MessageBubble key={msg.id} message={msg} />)
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <svg className="w-16 h-16 text-neutral-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <p className="text-neutral-500 text-sm font-medium">No activity yet</p>
                                <p className="text-neutral-400 text-xs mt-1">Send a message to begin the conversation</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
