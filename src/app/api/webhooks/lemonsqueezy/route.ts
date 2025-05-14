import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Define types for LemonSqueezy webhook payloads
interface LemonSqueezyWebhookPayload {
  meta: {
    event_name: string;
    custom_data?: {
      user_id?: string;
    };
  };
  data: {
    id: string;
    type: string;
    attributes: {
      status: string;
      customer_id: string;
      product_id: string;
      variant_id: string;
      user_email?: string;
      user_name?: string;
      first_order_item?: {
        id: string;
      };
      urls?: {
        customer_portal: string;
      };
      renews_at: string | null;
      ends_at: string | null;
      created_at: string;
      updated_at: string;
      test_mode: boolean;
    };
  };
}

// Verify webhook signature
function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    // Create HMAC SHA256 hash with the secret
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');
    
    // Compare our hash with the signature from LemonSqueezy
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature)
    );
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Get the raw request body
    const rawBody = await req.text();
    const body = JSON.parse(rawBody) as LemonSqueezyWebhookPayload;
    
    // Get the webhook signature from headers
    const signature = req.headers.get('x-signature');
    
    // Verify webhook signature
    if (signature) {
      const isValid = verifySignature(rawBody, signature, process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '');
      if (!isValid) {
        console.error('Invalid webhook signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.warn('No signature provided in webhook request');
      // In production, you might want to reject requests without signatures
      // return NextResponse.json({ error: 'No signature provided' }, { status: 401 });
    }
    
    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies });
    
    // Extract event name and data
    const { event_name, custom_data } = body.meta;
    const { attributes } = body.data;
    
    // Get user ID from custom data (if available)
    const userId = custom_data?.user_id;
    
    // If we don't have a user ID in custom data, try to find the user by email
    let targetUserId = userId;
    if (!targetUserId && attributes.user_email) {
      // First check the users table
      let { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', attributes.user_email)
        .single();
      
      // If not found in users table, try to find in auth.users via email query
      if (!userData) {
        // Using a direct query to auth.users is not recommended, but we need to find the user
        // In a real implementation, you should use the admin API with service role
        const { data: authUsers } = await supabase
          .from('auth.users')
          .select('id')
          .eq('email', attributes.user_email);
        
        if (authUsers && authUsers.length > 0) {
          targetUserId = authUsers[0].id;
          
          // Create user record if it doesn't exist
          await supabase.from('users').upsert({
            id: targetUserId,
            email: attributes.user_email,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      } else {
        targetUserId = userData.id;
      }
    }
    
    // If we still don't have a user ID, we can't proceed
    if (!targetUserId) {
      console.error('No user ID found in webhook payload or matching email in database');
      return NextResponse.json({ error: 'User not found' }, { status: 400 });
    }
    
    // Handle different webhook events
    switch (event_name) {
      case 'subscription_created':
      case 'subscription_updated':
        // Calculate expiration date from renews_at or ends_at
        const expiresAt = attributes.renews_at || attributes.ends_at;
        
        // Update user subscription status
        await supabase
          .from('users')
          .update({
            is_premium: attributes.status === 'active',
            lemon_squeezy_customer_id: attributes.customer_id,
            subscription_id: body.data.id,
            subscription_status: attributes.status,
            subscription_expires_at: expiresAt,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetUserId);
        
        console.log(`User ${targetUserId} subscription updated to ${attributes.status}`);
        break;
        
      case 'subscription_cancelled':
        // Update user subscription status to cancelled
        await supabase
          .from('users')
          .update({
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', targetUserId);
        
        console.log(`User ${targetUserId} subscription cancelled`);
        break;
        
      case 'subscription_expired':
        // Update user subscription status to expired and remove premium status
        await supabase
          .from('users')
          .update({
            is_premium: false,
            subscription_status: 'expired',
            updated_at: new Date().toISOString()
          })
          .eq('id', targetUserId);
        
        console.log(`User ${targetUserId} subscription expired`);
        break;
        
      case 'subscription_resumed':
        // Update user subscription status to active and set premium status
        await supabase
          .from('users')
          .update({
            is_premium: true,
            subscription_status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('id', targetUserId);
        
        console.log(`User ${targetUserId} subscription resumed`);
        break;
        
      default:
        console.log(`Unhandled webhook event: ${event_name}`);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
