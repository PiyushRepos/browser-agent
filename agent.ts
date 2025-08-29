import "dotenv/config";
import {
  Agent,
  OpenAIProvider,
  Runner,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
  tool,
} from "@openai/agents";
import { OpenAI } from "openai";
import { z } from "zod";
import pw from "playwright";
import readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import boxen from "boxen";
import cfonts from "cfonts";
import gradient from "gradient-string";
import { createSpinner } from "nanospinner";

console.clear();

// const banner = figlet.textSync("Chai and Automation", {
//   horizontalLayout: "default",
//   verticalLayout: "default",
// });

cfonts.say("Chai and\nAutomation", {
  font: "block",
  align: "center",
  colors: ["#FF6B35", "#FFB84D"],
  background: "transparent",
  letterSpacing: 1,
  lineHeight: 1,
  space: true,
  maxLength: "0",
  gradient: true,
  independentGradient: true,
});

console.log(
  chalk.hex("#FF6B35").italic("A CLI agent for browser automation") + "\n"
);

const browserSpinner = createSpinner("🌐 Starting browser engine...");
browserSpinner.start();

const browser = await pw.chromium.launch({
  headless: false,
  args: ["--start-maximized", "--disable-extensions", "--disable-file-system"],
  chromiumSandbox: true,
});

let page = await browser.newPage();
browserSpinner.success({ text: "🌐 Browser ready!" });

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME;

if (!GEMINI_BASE_URL || !GEMINI_API_KEY || !GEMINI_MODEL_NAME) {
  console.log(chalk.hex("#FF6B35").bold("❌ Missing environment variables!"));
  console.log(
    chalk.hex("#FFB84D")(
      "Set: GEMINI_BASE_URL, GEMINI_API_KEY, GEMINI_MODEL_NAME"
    )
  );
  process.exit(1);
}

const openAIClient = new OpenAI({
  apiKey: GEMINI_API_KEY,
  baseURL: GEMINI_BASE_URL,
});

const modelProvider = new OpenAIProvider({
  openAIClient,
});

setDefaultOpenAIClient(openAIClient);
setOpenAIAPI("chat_completions");
setTracingDisabled(true);

const takeScreenshotTool = tool({
  name: "take_screenshot",
  description: "Capture a screenshot of the current page for visual analysis.",
  parameters: z.object({
    path: z.string().describe("Path of screenshot, where it will be saved"),
  }),
  execute: async ({ path }) => {
    const screenshotSpinner = ora("📸 Taking screenshot...").start();
    const screenshotBytes = await page.screenshot({
      fullPage: true,
      type: "png",
      path: path || `screenshot-${Date.now()}.png`,
    });
    await page.waitForTimeout(500);

    const base64 = screenshotBytes.toString("base64");
    screenshotSpinner.succeed(
      chalk.hex("#FFB84D")(
        `📸 Screenshot: ${path || `screenshot-${Date.now()}.png`}`
      )
    );

    return {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: base64,
      },
      description: "Current page screenshot",
    };
  },
});

const navigateTool = tool({
  name: "navigate",
  description: "Navigate to a specific URL.",
  parameters: z.object({
    url: z.string().describe("The URL to navigate to."),
  }),
  execute: async ({ url }) => {
    const navSpinner = ora(chalk.hex("#FFB84D")(`🌐 ${url}...`)).start();
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);
      navSpinner.succeed(chalk.hex("#4CAF50")(`🌐 Loaded: ${url}`));
      return `Successfully navigated to: ${url}`;
    } catch (error) {
      navSpinner.fail(chalk.hex("#FF6B35")(`❌ Failed: ${url}`));
      return `Failed to navigate to ${url}: ${error.message}`;
    }
  },
});

const clickOnElementTool = tool({
  name: "clickOnElement",
  description: "Click on a specific element using CSS selector.",
  parameters: z.object({
    selector: z.string().describe("The CSS selector of the element to click."),
  }),
  execute: async ({ selector }) => {
    const clickSpinner = ora(chalk.hex("#FFB84D")(`👆 ${selector}...`)).start();
    try {
      await page.waitForSelector(selector, {
        state: "visible",
        timeout: 10000,
      });

      await page.click(selector);
      await page.waitForTimeout(1000);

      clickSpinner.succeed(chalk.hex("#4CAF50")(`👆 Clicked: ${selector}`));
      return `Successfully clicked on element: ${selector}`;
    } catch (error) {
      clickSpinner.fail(chalk.hex("#FF6B35")(`❌ Failed: ${selector}`));
      return `Failed to click element ${selector}: ${error.message}`;
    }
  },
});

const typeTool = tool({
  name: "type",
  description: "Type text into a specific input field using CSS selector.",
  parameters: z.object({
    selector: z.string().describe("The CSS selector of the input field."),
    text: z.string().describe("The text to type into the input field."),
  }),
  execute: async ({ selector, text }) => {
    const typeSpinner = ora(chalk.hex("#FFB84D")(`⌨️  ${selector}...`)).start();
    try {
      await page.waitForSelector(selector, {
        state: "visible",
        timeout: 10000,
      });

      await page.fill(selector, "");
      await page.fill(selector, text);
      await page.waitForTimeout(500);

      typeSpinner.succeed(chalk.hex("#4CAF50")(`⌨️  Typed: ${text}`));
      return `Successfully typed "${text}" into element: ${selector}`;
    } catch (error) {
      typeSpinner.fail(chalk.hex("#FF6B35")(`❌ Failed: ${selector}`));
      return `Failed to type into element ${selector}: ${error.message}`;
    }
  },
});

const scrollTool = tool({
  name: "scroll",
  description: "Scroll the page by a specific amount.",
  parameters: z.object({
    x: z.number().describe("The amount to scroll horizontally."),
    y: z.number().describe("The amount to scroll vertically."),
  }),
  execute: async ({ x, y }) => {
    const scrollSpinner = ora(chalk.hex("#FFB84D")("📜 Scrolling...")).start();
    await page.evaluate(`window.scrollBy(${x}, ${y});`);
    await page.waitForTimeout(1000);
    scrollSpinner.succeed(chalk.hex("#4CAF50")(`📜 Scrolled: ${x},${y}`));
    return `Scrolled by x: ${x}, y: ${y}`;
  },
});

const waitTool = tool({
  name: "wait",
  description: "Wait for a specific duration.",
  parameters: z.object({
    duration: z.number().describe("The duration to wait, in milliseconds."),
  }),
  execute: async ({ duration }) => {
    const waitSpinner = ora(
      chalk.hex("#FFB84D")(`⏱️  ${duration}ms...`)
    ).start();
    await page.waitForTimeout(duration);
    waitSpinner.succeed(chalk.hex("#4CAF50")("⏱️  Done"));
    return `Waited for ${duration} milliseconds.`;
  },
});

const extractPageElements = tool({
  name: "extract_page_elements",
  description:
    "Extracts structured information from the DOM, focusing on forms, inputs, and buttons relevant to the task.",
  parameters: z.object({
    selectionArea: z
      .string()
      .nullable()
      .default("form")
      .describe(
        "Specific section of the page to inspect, e.g. 'form', 'inputs', 'buttons'"
      ),
  }),
  async execute({ selectionArea = "form" }) {
    const analyzeSpinner = ora(chalk.hex("#FFB84D")("🔍 Analyzing...")).start();

    const extractedElements = await page.evaluate((focus) => {
      const collectedElements: any[] = [];

      const formElements = document.querySelectorAll("form");
      formElements.forEach((form, index) => {
        collectedElements.push({
          tag: "form",
          selector: `form:nth-child(${index + 1})`,
          id: form.id,
          className: form.className,
          action: form.action,
        });
      });

      const inputElements = document.querySelectorAll(
        "input, textarea, select"
      );
      inputElements.forEach((input: any) => {
        const selectorHints: string[] = [];
        if (input.id) selectorHints.push(`#${input.id}`);
        if (input.name) selectorHints.push(`[name="${input.name}"]`);
        if (input.type) selectorHints.push(`input[type="${input.type}"]`);
        if (input.placeholder)
          selectorHints.push(`[placeholder="${input.placeholder}"]`);

        collectedElements.push({
          tag: input.tagName.toLowerCase(),
          type: input.type,
          id: input.id,
          name: input.name,
          className: input.className,
          placeholder: input.placeholder,
          selectors: selectorHints,
          value: input.value,
          required: input.required,
          visible: input.offsetParent !== null,
        });
      });

      const buttonElements = document.querySelectorAll(
        'button, input[type="submit"], input[type="button"]'
      );
      buttonElements.forEach((button: any) => {
        const selectorHints: string[] = [];

        if (button.id) selectorHints.push(`#${button.id}`);
        if (button.className) {
          const classes = button.className.split(" ").filter(Boolean);
          if (classes.length > 0) selectorHints.push(`.${classes.join(".")}`);
        }
        if (button.type) selectorHints.push(`[type="${button.type}"]`);

        collectedElements.push({
          tag: button.tagName.toLowerCase(),
          type: button.type,
          id: button.id,
          className: button.className,
          textContent: button.textContent?.trim(),
          value: button.value,
          selectors: selectorHints,
          visible: button.offsetParent !== null,
        });
      });

      return collectedElements;
    }, selectionArea || "form");

    analyzeSpinner.succeed(
      chalk.hex("#4CAF50")(`🔍 Found: ${extractedElements.length} elements`)
    );
    return { elements: extractedElements };
  },
});

export function askUser({ question }: { question: string }): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const questionBox = boxen(
      gradient(["#FF6B35", "#FFB84D"]).multiline(`🤔 ${question}`, {
        interpolation: "hsv",
      }),
      {
        margin: 1,
        padding: 0.5,
        borderStyle: "round",
        borderColor: "#FFB84D",
      }
    );

    console.log(questionBox);

    rl.question(chalk.hex("#FF6B35").bold("->  "), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

const askUserTool = tool({
  name: "ask_user",
  description: "Ask the user for more information if needed.",
  parameters: z.object({
    question: z.string().describe("The question to ask the user."),
  }),
  execute: async ({ question }) => {
    const answer = await askUser({ question });
    return answer;
  },
});

const SYSTEM_INSTRUCTIONS = `
    You are a browser automation agent that helps users automate web interactions using Playwright.

    WORKFLOW:
    1. Navigate to the target URL
    2. Use extract_page_elements to analyze the page and find form elements  
    3. Use the selector information from the structure to interact with elements
    4. Complete the requested actions step by step

    AVAILABLE TOOLS:
    - navigate: Go to a URL
    - extract_page_elements: Get detailed page structure with multiple selector options for each element
    - clickOnElement: Click using CSS selector 
    - type: Type text into input fields
    - scroll: Scroll the page
    - wait: Wait for specified milliseconds
    - take_screenshot: Capture screenshot for debugging
    - ask_user: Ask the user for more information if needed

    ELEMENT SELECTION STRATEGY:
    The extract_page_elements tool provides multiple selectors for each element. Choose selectors in this order:
    1. ID selector: #elementId (most reliable)
    2. Name attribute: [name="elementName"] 
    3. Specific input type: input[type="email"]
    4. Placeholder: [placeholder="Enter email"]
    5. Class selectors: .className (least reliable)

    FORM AUTOMATION PROCESS:
    1. Navigate to the page
    2. Get page structure to see all available form elements
    3. For each form field:
       - Choose the best selector from the provided options
       - Click the field first (to focus it)
       - Type the required text
    4. Find and click the submit button using its selectors

    ERROR HANDLING:
    - If a selector fails, try the next selector from the element's selectors array
    - The structure shows visibility info - only interact with visible elements
    - Use wait tool if elements need time to appear

    IMPORTANT NOTES:
    - Always use extract_page_elements first to understand what elements are available
    - The structure provides multiple selector options - use the most reliable one
    - Click before typing to ensure field focus
    - Look for visible: true in element info before interacting
    - If user did not provided you the necessary information and you need to ask user for more information, use the ask_user tool and do not just terminate the process.

    Start by navigating to the URL and analyzing the page structure!
  `;

const agent = new Agent({
  name: "Website Automation Agent",
  instructions: SYSTEM_INSTRUCTIONS,
  tools: [
    navigateTool,
    extractPageElements,
    clickOnElementTool,
    typeTool,
    waitTool,
    scrollTool,
    takeScreenshotTool,
    askUserTool,
  ],
  model: GEMINI_MODEL_NAME,
});

async function main() {
  let query = await askUser({
    question: "What do you want to automate today?",
  });

  if (!query || query.trim().length === 0) {
    query = "Automate the login process on the website.";
    console.log(
      chalk.hex("#FFB84D")("⚠️  Using default task: ") + chalk.gray(query)
    );
  }

  console.log(chalk.hex("#FF6B35")("🚀 Task: ") + chalk.white(query));

  //   const executionSpinner = createSpinner(chalk.hex("#FFB84D")("🤖 Working..."));
  //   executionSpinner.start();

  try {
    const runner = new Runner({ modelProvider });
    const result = await runner.run(agent, query, { maxTurns: 30 });

    // executionSpinner.success({
    //   text: chalk.hex("#4CAF50")("✅ Task completed!"),
    // });

    console.log(
      boxen(
        chalk.hex("#4CAF50")("🎉 Result:\n") +
          chalk.white(result.finalOutput || "Task completed successfully!"),
        {
          padding: 0,
          margin: 0,
          borderStyle: "single",
          borderColor: "#4CAF50",
        }
      )
    );
  } catch (error) {
    // executionSpinner.error({ text: chalk.hex("#FF6B35")("❌ Task failed!") });
    console.log(
      boxen(chalk.hex("#FF6B35")("❌ Error:\n") + chalk.white(error.message), {
        padding: 0,
        margin: 0,
        borderStyle: "single",
        borderColor: "#FF6B35",
      })
    );
  }

  const exitSpinner = ora(chalk.hex("#FFB84D")("👋 Closing...")).start();
  await browser.close();
  exitSpinner.succeed(chalk.hex("#4CAF50")("👋 Done!"));
}

main();
