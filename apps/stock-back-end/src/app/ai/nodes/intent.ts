export enum IntentType {
  'get_orders' = 'get_orders',
  'general_chat' = 'general_chat',
}

export interface Intent {
  intent_type: IntentType;
}
