// TODO:create package.json script to insert seed 


import { PrismaClient } from "@prisma/client";

export const prismaClient = new PrismaClient();

async function main() {
  // Single user ID for all websites
  const userId = '3327df67-d12d-40c5-aa26-e5142bada5db';

  // Valid websites (127 records - approximately 85%)
  const validWebsites = [
    'https://google.com',
    'https://github.com',
    'https://stackoverflow.com',
    'https://youtube.com',
    'https://facebook.com',
    'https://twitter.com',
    'https://linkedin.com',
    'https://amazon.com',
    'https://netflix.com',
    'https://microsoft.com',
    'https://apple.com',
    'https://wikipedia.org',
    'https://reddit.com',
    'https://instagram.com',
    'https://tiktok.com',
    'https://discord.com',
    'https://spotify.com',
    'https://twitch.tv',
    'https://zoom.us',
    'https://slack.com',
    'https://notion.so',
    'https://figma.com',
    'https://canva.com',
    'https://dropbox.com',
    'https://airbnb.com',
    'https://uber.com',
    'https://shopify.com',
    'https://stripe.com',
    'https://paypal.com',
    'https://salesforce.com',
    'https://adobe.com',
    'https://atlassian.com',
    'https://trello.com',
    'https://asana.com',
    'https://mailchimp.com',
    'https://hubspot.com',
    'https://intercom.com',
    'https://zendesk.com',
    'https://freshworks.com',
    'https://monday.com',
    'https://airtable.com',
    'https://typeform.com',
    'https://calendly.com',
    'https://loom.com',
    'https://miro.com',
    'https://gitlab.com',
    'https://bitbucket.org',
    'https://heroku.com',
    'https://vercel.com',
    'https://netlify.com',
    'https://digitalocean.com',
    'https://aws.amazon.com',
    'https://cloud.google.com',
    'https://azure.microsoft.com',
    'https://firebase.google.com',
    'https://mongodb.com',
    'https://prisma.io',
    'https://nextjs.org',
    'https://reactjs.org',
    'https://vuejs.org',
    'https://angular.io',
    'https://svelte.dev',
    'https://tailwindcss.com',
    'https://bootstrap.com',
    'https://materialui.com',
    'https://chakra-ui.com',
    'https://antd.antgroup.com',
    'https://nodejs.org',
    'https://expressjs.com',
    'https://nestjs.com',
    'https://fastapi.tiangolo.com',
    'https://django.djangoproject.com',
    'https://flask.palletsprojects.com',
    'https://rubyonrails.org',
    'https://laravel.com',
    'https://symfony.com',
    'https://codeigniter.com',
    'https://spring.io',
    'https://dotnet.microsoft.com',
    'https://golang.org',
    'https://rust-lang.org',
    'https://kotlinlang.org',
    'https://swift.org',
    'https://dart.dev',
    'https://flutter.dev',
    'https://reactnative.dev',
    'https://ionic.io',
    'https://cordova.apache.org',
    'https://electronjs.org',
    'https://tauri.app',
    'https://unity.com',
    'https://unrealengine.com',
    'https://godotengine.org',
    'https://blender.org',
    'https://gimp.org',
    'https://inkscape.org',
    'https://krita.org',
    'https://audacity.org',
    'https://obs.live',
    'https://davinci-resolve.com',
    'https://vscode.dev',
    'https://atom.io',
    'https://sublimetext.com',
    'https://vim.org',
    'https://emacs.org',
    'https://jetbrains.com',
    'https://postman.com',
    'https://insomnia.rest',
    'https://httpie.io',
    'https://curl.se',
    'https://docker.com',
    'https://kubernetes.io',
    'https://terraform.io',
    'https://ansible.com',
    'https://jenkins.io',
    'https://circleci.com',
    'https://travis-ci.org',
    'https://codecov.io',
    'https://sentry.io',
    'https://datadog.com',
    'https://newrelic.com',
    'https://splunk.com',
    'https://elastic.co',
    'https://grafana.com',
    'https://prometheus.io',
    'https://jaegertracing.io',
    'https://opentelemetry.io',
    'https://hashicorp.com',
    'https://cloudflare.com',
    'https://fastly.com'
  ];

  // Invalid/questionable websites (23 records - approximately 15%)
  const invalidWebsites = [
    'http://invalid-site-123.fake',
    'https://non-existent-domain-xyz.com',
    'ftp://old-protocol-site.net',
    'https://broken-ssl-cert.expired',
    'http://localhost:3000',
    'https://127.0.0.1:8080',
    'https://test.local',
    'https://example.test',
    'https://fake-news-source.info',
    'https://malicious-download.suspicious',
    'https://phishing-attempt.scam',
    'https://expired-domain-404.dead',
    'https://under-construction.temp',
    'https://parked-domain.placeholder',
    'http://unsecure-site.vulnerable',
    'https://typo-squatting-gogle.com',
    'https://fake-banking-site.fraud',
    'https://virus-download.malware',
    'https://spam-generator.junk',
    'https://illegal-content.blocked',
    'https://copyright-violation.piracy',
    'https://data-harvester.privacy',
    'https://clickbait-factory.ads'
  ];

  // Combine all websites
  const allWebsites = [...validWebsites, ...invalidWebsites];

  // Shuffle array to randomize order
  const shuffledWebsites = allWebsites.sort(() => Math.random() - 0.5);

  console.log(`Starting seed process...`);
  console.log(`Total websites to insert: ${shuffledWebsites.length}`);
  console.log(`Valid websites: ${validWebsites.length} (${((validWebsites.length / shuffledWebsites.length) * 100).toFixed(1)}%)`);
  console.log(`Invalid websites: ${invalidWebsites.length} (${((invalidWebsites.length / shuffledWebsites.length) * 100).toFixed(1)}%)`);

  // Insert websites in batches for better performance
  const batchSize = 25;
  let insertedCount = 0;

  for (let i = 0; i < shuffledWebsites.length; i += batchSize) {
    const batch = shuffledWebsites.slice(i, i + batchSize);
    
    const websiteData = batch.map((url, index) => {
      // Vary the time_added to simulate different insertion times
      const daysAgo = Math.floor(Math.random() * 90); // Random date within last 90 days
      const hoursAgo = Math.floor(Math.random() * 24);
      const minutesAgo = Math.floor(Math.random() * 60);
      
      const timeAdded = new Date();
      timeAdded.setDate(timeAdded.getDate() - daysAgo);
      timeAdded.setHours(timeAdded.getHours() - hoursAgo);
      timeAdded.setMinutes(timeAdded.getMinutes() - minutesAgo);

      return {
        url: url,
        user_id: userId,
        time_added: timeAdded
      };
    });

    try {
      await prismaClient.website.createMany({
        data: websiteData,
        skipDuplicates: true
      });
      
      insertedCount += batch.length;
      console.log(`Inserted batch ${Math.ceil((i + batchSize) / batchSize)}: ${insertedCount}/${shuffledWebsites.length} websites`);
    } catch (error) {
      console.error(`Error inserting batch ${Math.ceil((i + batchSize) / batchSize)}:`, error);
    }
  }

  console.log(`Seed completed! Inserted ${insertedCount} websites.`);
  
  // Verify the data
  const count = await prismaClient.website.count();
  console.log(`Total websites in database: ${count}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaClient.$disconnect();
  });