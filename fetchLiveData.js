const fs = require("node:fs");
const path = require("node:path");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}

const env = readEnvFile(path.join(__dirname, ".env"));
const appToken = process.env.NYC_OPEN_DATA_APP_TOKEN || env.NYC_OPEN_DATA_APP_TOKEN;

if (!appToken || appToken === "your_nyc_open_data_app_token") {
  throw new Error(
    "Set NYC_OPEN_DATA_APP_TOKEN in .env before running this script."
  );
}

async function fetchLiveSchoolData() {
  const response = await fetch(
    "https://data.cityofnewyork.us/api/v3/views/dnpx-dfnc/query.json",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Token": appToken,
      },
      body: JSON.stringify({
        query: `
          SELECT substring(dbn, 3, 1) AS borough_code,
                 avg(metric_score) AS average_metric_score,
                 count(*) AS metric_row_count
          WHERE metric_score IS NOT NULL
          GROUP BY substring(dbn, 3, 1)
          ORDER BY average_metric_score DESC
        `,
        page: {
          pageNumber: 1,
          pageSize: 10,
        },
        includeSynthetic: false,
      }),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`NYC Open Data request failed (${response.status}): ${message}`);
  }

  return response.json();
}

fetchLiveSchoolData()
  .then((data) => {
    const boroughNames = {
      M: "Manhattan",
      X: "Bronx",
      K: "Brooklyn",
      Q: "Queens",
      R: "Staten Island",
    };

    const results = Array.isArray(data) ? data : data.data || data.results || data;
    const boroughScores = results
      .filter((row) => boroughNames[row.borough_code])
      .map((row) => ({
        borough: boroughNames[row.borough_code],
        averageMetricScore: Number(row.average_metric_score).toFixed(2),
        metricRows: Number(row.metric_row_count),
      }));

    console.table(boroughScores);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
