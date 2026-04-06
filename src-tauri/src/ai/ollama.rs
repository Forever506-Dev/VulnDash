use serde::{Deserialize, Serialize};

const OLLAMA_BASE: &str = "http://localhost:11434";

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    name: String,
}

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    stream: bool,
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
}

pub async fn is_available() -> bool {
    let client = reqwest::Client::new();
    match client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

pub async fn get_model() -> Option<String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .ok()?;

    let tags: TagsResponse = resp.json().await.ok()?;
    if tags.models.is_empty() {
        return None;
    }

    // Prefer security-focused / coding models
    let preferred = ["codellama", "llama3", "mistral", "llama2"];
    for pref in preferred {
        if let Some(m) = tags.models.iter().find(|m| m.name.starts_with(pref)) {
            return Some(m.name.clone());
        }
    }

    // Fall back to first available
    Some(tags.models[0].name.clone())
}

pub async fn ask(model: &str, prompt: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = GenerateRequest {
        model,
        prompt,
        stream: false,
    };

    let resp = client
        .post(format!("{}/api/generate", OLLAMA_BASE))
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama returned status {}", resp.status()));
    }

    let gen: GenerateResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    Ok(gen.response)
}
