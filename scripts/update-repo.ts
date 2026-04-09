import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { TechRepo } from '@repo-pulse/shared';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_KEY', 'GEMINI_API_KEY'];
requiredEnv.forEach(env => {
  if (!process.env[env]) throw new Error(`Missing Environment Variable: ${env}`);
});

const supabase = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_KEY']!);
const genAI = new GoogleGenerativeAI(process.env['GEMINI_API_KEY']!);

async function runScraper() {
  console.log('Scouting GitHub for the next big thang');

  try {

    const githubUrl = 'https://api.github.com/search/repositories?q=topic:ai+stars:>1000&sort=stars&order=desc';
    const { data } = await axios.get(githubUrl);

    if (!data.items || data.items.length === 0) {
      console.log('GitHub returned no results. Check your query or rate limits.');
      return;
    }
    
    // TODO: change this logic later
    const repo = data.items[0]; 
    console.log(`Found: ${repo.full_name}. Asking Gemini to analyze...`);

    let aiSummary = "";
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `You are a technical curator. 
        Analyze this GitHub repo: ${repo.full_name}.
        Original Description: ${repo.description}
        
        Write a 4-paragraph summary:
        1. What problem does this solve?
        2. Key technical features.
        3. Why should a developer care today?
        4. Real world use case(s)
        
        Keep the tone professional, insightful, and concise.`;

        const result = await model.generateContent(prompt);
        aiSummary = result.response.text();

        if (!aiSummary) throw new Error("Gemini returned an empty response.");

    } catch (aiError: any) {
      console.error('Gemini Analysis Failed:', aiError.message);

      aiSummary = repo.description || "No description available.";
    }

    const newRepo: TechRepo = {
      github_id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: aiSummary,
      stars: repo.stargazers_count,
      language: repo.language || 'Multi',
      url: repo.html_url,
      slug: repo.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    };

    const { error } = await supabase
      .from('repositories')
      .upsert(newRepo, { onConflict: 'github_id' });

    if (error) {
      console.error('Supabase save error:', error.message);
      return;
    }

    console.log(`Success! ${repo.name} is now live in the database.`);

  } catch (error: any) {
    console.error('Scraper crashed:', error);
  }
}

runScraper();