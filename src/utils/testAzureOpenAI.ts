import * as dotenv from 'dotenv';
import { AzureOpenAI } from 'openai';

// Load environment variables
dotenv.config();

/**
 * Test Azure OpenAI connection and find available deployments
 */
async function testAzureOpenAI() {
  console.log('=== Azure OpenAI Connection Test ===\n');

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
  const apiKey = process.env.AZURE_OPENAI_API_KEY || '';
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '';

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Deployment: ${deploymentName}`);
  console.log(`API Version: ${apiVersion}\n`);

  try {
    // Test 1: Try the configured deployment
    console.log('Test 1: Testing configured deployment...');
    const client = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion,
      deployment: deploymentName,
    });

    const response = await client.chat.completions.create({
      model: deploymentName,
      messages: [
        { role: 'user', content: 'Respond with: "Azure OpenAI connection successful!"' },
      ],
      max_completion_tokens: 2000,
    });

    console.log('✅ SUCCESS! Azure OpenAI is working correctly!');
    console.log(`Response: ${response.choices[0]?.message?.content}`);
    console.log(`Model: ${response.model}`);
    console.log(`Tokens used: ${response.usage?.total_tokens} (${response.usage?.completion_tokens_details?.reasoning_tokens || 0} reasoning)\n`);

  } catch (error: any) {
    console.log('❌ Error with configured deployment');
    console.log(`Error: ${error.message}\n`);

    if (error.status === 404) {
      console.log('The deployment name might be incorrect. Common deployment names:');
      console.log('  - gpt-4');
      console.log('  - gpt-4-32k');
      console.log('  - gpt-35-turbo');
      console.log('  - gpt-35-turbo-16k');
      console.log('\nHow to find your deployment name:');
      console.log('1. Go to: https://portal.azure.com');
      console.log('2. Navigate to your Azure OpenAI resource');
      console.log('3. Click "Model deployments" or "Deployments"');
      console.log('4. Copy the exact deployment name from the list');
      console.log('5. Update AZURE_OPENAI_DEPLOYMENT_NAME in your .env file\n');

      // Try common deployment names
      console.log('Attempting to test common deployment names...\n');
      const commonNames = ['gpt-4', 'gpt-35-turbo', 'gpt-4-32k', 'gpt-35-turbo-16k'];

      for (const testName of commonNames) {
        try {
          console.log(`Testing: ${testName}...`);
          const testClient = new AzureOpenAI({
            endpoint,
            apiKey,
            apiVersion,
            deployment: testName,
          });

          const testResponse = await testClient.chat.completions.create({
            model: testName,
            messages: [
              { role: 'system', content: 'You are a helpful assistant.' },
              { role: 'user', content: 'Say "Working!"' },
            ],
            max_completion_tokens: 100,
          });

          console.log(`  ✅ FOUND WORKING DEPLOYMENT: ${testName}`);
          console.log(`  Response: ${testResponse}`);
          console.log(`\n  Update your .env file with:`);
          console.log(`  AZURE_OPENAI_DEPLOYMENT_NAME=${testName}\n`);
          break;
        } catch (testError: any) {
          console.log(`  ❌ ${testName} not available. This is the error: ${testError.message}.`);
        }
      }
    } else if (error.status === 401) {
      console.log('Authentication error. Check your API key.');
    } else {
      console.log(`Unexpected error: ${error.status} - ${error.message}`);
    }
  }

  console.log('\n=== Test Complete ===');
}

// Run the test
testAzureOpenAI().catch(console.error);
