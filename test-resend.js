import { Resend } from 'resend';

const resend = new Resend('re_XhCdy6P7_7poeNWRaBbYwQSx1xRmSHpRD');

async function testEmail() {
    try {
        console.log('🧪 Testing Resend email sending...');
        
        const { data, error } = await resend.emails.send({
            from: 'EvidFlow <nonreply@evidflow.com>',
            to: ['petergatitu61@gmail.com'],  // Replace with your actual email
            subject: 'Test Email from EvidFlow - Resend',
            html: '<h1>This is a test email from Resend!</h1><p>If you receive this, Resend is working correctly.</p>',
        });

        if (error) {
            console.error('❌ Resend test failed:', error);
            return;
        }

        console.log('✅ Resend test successful - Email sent!');
        console.log('Email ID:', data?.id);
    } catch (error) {
        console.error('❌ Resend test error:', error.message);
    }
}

testEmail();
