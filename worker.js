const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function dataUrlToBytes(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Invalid image data.");
  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mimeType };
}

function dataUrlToFile(dataUrl, filename) {
  const parsed = dataUrlToBytes(dataUrl);
  return new File([parsed.bytes], filename, { type: parsed.mimeType });
}

function safePart(value) {
  return String(value || "job")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "job";
}

async function putImage(env, { jobId, type, image }) {
  if (!env.IMAGES) throw new Error("R2 binding IMAGES is not configured.");
  const parsed = dataUrlToBytes(image);
  const ext = parsed.mimeType.includes("png") ? "png" : "jpg";
  const key = `jobs/${safePart(jobId)}/${safePart(type)}-${crypto.randomUUID()}.${ext}`;

  await env.IMAGES.put(key, parsed.bytes, {
    httpMetadata: {
      contentType: parsed.mimeType,
      cacheControl: "public, max-age=31536000",
    },
    customMetadata: {
      jobId: String(jobId || ""),
      type: String(type || ""),
      uploadedAt: new Date().toISOString(),
    },
  });

  return {
    key,
    url: `/api/images/${encodeURIComponent(key)}`,
  };
}

async function handleImageUpload(request, env) {
  const body = await request.json();
  if (!body.image) return json({ error: "image is required." }, 400);
  if (!body.jobId) return json({ error: "jobId is required." }, 400);
  if (!body.type) return json({ error: "type is required." }, 400);

  const saved = await putImage(env, {
    jobId: body.jobId,
    type: body.type,
    image: body.image,
  });

  return json({ ok: true, ...saved });
}

async function handleImageGet(path, env) {
  if (!env.IMAGES) return json({ error: "R2 binding IMAGES is not configured." }, 500);

  const prefix = "/api/images/";
  const encodedKey = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  const key = decodeURIComponent(encodedKey);

  if (!key) return json({ error: "Image key required." }, 400);

  const object = await env.IMAGES.get(key);
  if (!object) return json({ error: "Image not found." }, 404);

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000");

  return new Response(object.body, { headers });
}

async function handleRendering(request, env) {
  if (!env.OPENAI_API_KEY) {
    return json(
      {
        error: "OPENAI_API_KEY is not configured in dcc-os-api.",
      },
      500
    );
  }

  const body = await request.json();

  if (!body.counterPhoto || !body.samplePhoto) {
    return json(
      {
        error: "Customer counter photo and DCC sample photo are required.",
      },
      400
    );
  }

  const counterPhoto = dataUrlToFile(body.counterPhoto, "customer-counter.jpg");
  const samplePhoto = dataUrlToFile(body.samplePhoto, "dcc-sample.jpg");

  const prompt =
    body.instruction ||
    `Use image 1 as the customer's real room and countertop geometry.

Use image 2 only as the Davis Custom Counter Tops epoxy finish reference.

Create a photorealistic customer preview.

Apply the DCC sample's colors, pattern, movement, veining, and finish to the countertop surfaces in image 1.

Preserve the room, cabinets, backsplash, appliances, sink, walls, lighting, camera position, perspective, and layout.

Do not redesign the room.

Do not add text, logos, people, or objects.

Change only the countertop finish.`;

  const form = new FormData();

  form.append("model", "gpt-image-2");
  form.append("image[]", counterPhoto);
  form.append("image[]", samplePhoto);
  form.append("prompt", prompt);
  form.append("size", "1536x1024");
  form.append("quality", "medium");
  form.append("output_format", "jpeg");

  const openaiResponse = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: form,
  });

  const result = await openaiResponse.json();

  if (!openaiResponse.ok) {
    return json(
      {
        error:
          result?.error?.message ||
          `OpenAI image rendering failed (${openaiResponse.status}).`,
        openai_status: openaiResponse.status,
      },
      openaiResponse.status
    );
  }

  const imageBase64 = result?.data?.[0]?.b64_json;

  if (!imageBase64) {
    return json(
      {
        error: "OpenAI returned no rendered image.",
      },
      502
    );
  }

  const image = `data:image/jpeg;base64,${imageBase64}`;
  const response = { image };

  if (body.jobId && env.IMAGES) {
    try {
      const saved = await putImage(env, {
        jobId: body.jobId,
        type: "ai-rendering",
        image,
      });
      response.imageKey = saved.key;
      response.imageUrl = saved.url;
    } catch (error) {
      response.imageSaveWarning = error.message || String(error);
    }
  }

  return json(response);
}

function parseOpenAIJsonOutput(result) {
  if (!result) return null;
  if (typeof result.output_text === "string") {
    const text = result.output_text.trim();
    try {
      return JSON.parse(text);
    } catch {}
  }
  if (Array.isArray(result.output)) {
    let accumulated = "";
    for (const item of result.output) {
      if (item.type === "output_text" && typeof item.text === "string") {
        accumulated += item.text;
      }
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const chunk of item.content) {
          if (chunk.type === "output_text" && typeof chunk.text === "string") {
            accumulated += chunk.text;
          }
        }
      }
    }
    accumulated = accumulated.trim();
    try {
      return JSON.parse(accumulated);
    } catch {
      const match = accumulated.match(/\{[\s\S]*\}$/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {}
      }
    }
  }
  return null;
}

function normalizeNullable(value) {
  return value === undefined ? null : value;
}

async function handleDrawingIntake(request, env) {
  if (!env.OPENAI_API_KEY) {
    return json(
      {
        error: "OPENAI_API_KEY is not configured in dcc-os-api.",
      },
      500
    );
  }

  const body = await request.json();
  if (!body.image) {
    return json({ error: "image is required." }, 400);
  }

  const jobId = body.jobId || "drawing-intake";
  const savedImage = await putImage(env, {
    jobId,
    type: "drawing-original",
    image: body.image,
  });

  const imageFile = dataUrlToFile(body.image, "drawing-original.jpg");
  const prompt = `Analyze the attached countertop drawing and return ONLY a JSON object with these exact properties:
- customerName
- projectName
- countertopSections
- lengths
- widths
- backsplashDimensions
- sinkLocations
- cooktopLocations
- notes
- confidence

If a field is not visible or uncertain, set it to null. Use an array for section and location fields. Use only valid JSON, no markdown, no prose, and no additional keys.`;

  const form = new FormData();
  form.append("model", "gpt-4.1-mini");
  form.append("input", JSON.stringify([
    {
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: `attachment://${imageFile.name}` },
      ],
    },
  ]));
  form.append("file", imageFile, imageFile.name);
  form.append("temperature", "0.2");

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: form,
  });

  const result = await openaiResponse.json();
  if (!openaiResponse.ok) {
    return json(
      {
        error:
          result?.error?.message ||
          `OpenAI drawing intake failed (${openaiResponse.status}).`,
      },
      openaiResponse.status
    );
  }

  const parsed = parseOpenAIJsonOutput(result);
  if (!parsed || typeof parsed !== "object") {
    return json(
      {
        error: "OpenAI returned malformed JSON for drawing intake.",
        raw: result,
      },
      502
    );
  }

  const output = {
    customerName: normalizeNullable(parsed.customerName),
    projectName: normalizeNullable(parsed.projectName),
    countertopSections: Array.isArray(parsed.countertopSections)
      ? parsed.countertopSections
      : null,
    lengths: Array.isArray(parsed.lengths) ? parsed.lengths : null,
    widths: Array.isArray(parsed.widths) ? parsed.widths : null,
    backsplashDimensions: normalizeNullable(parsed.backsplashDimensions),
    sinkLocations: Array.isArray(parsed.sinkLocations)
      ? parsed.sinkLocations
      : null,
    cooktopLocations: Array.isArray(parsed.cooktopLocations)
      ? parsed.cooktopLocations
      : null,
    notes: normalizeNullable(parsed.notes),
    confidence:
      typeof parsed.confidence === "number"
        ? parsed.confidence
        : normalizeNullable(parsed.confidence),
  };

  return json(output);
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: corsHeaders,
        });
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const method = request.method;

      if (path === "/") {
        return json({
          ok: true,
          app: "DCC OS API",
          database: "D1 connected",
          images: env.IMAGES ? "R2 connected" : "R2 missing",
        });
      }

      if (path === "/api/rendering" && method === "POST") {
        return handleRendering(request, env);
      }

      if (path === "/api/drawing-intake" && method === "POST") {
        return handleDrawingIntake(request, env);
      }

      if (path === "/api/images" && method === "POST") {
        return handleImageUpload(request, env);
      }

      if (path.startsWith("/api/images/") && method === "GET") {
        return handleImageGet(path, env);
      }

      if (path === "/api/jobs" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM jobs ORDER BY updated_at DESC"
        ).all();

        return json(result.results || []);
      }

      if (path === "/api/jobs" && method === "POST") {
        const body = await request.json();

        const id = body.id || crypto.randomUUID();
        const customerName = body.customer_name || "";
        const projectName = body.project_name || "";
        const status = body.status || "Draft Quote";
        const total = Number(body.total || 0);
        const data = JSON.stringify(body.data || body);
        const updatedAt = new Date().toISOString();

        await env.DB.prepare(
          `INSERT INTO jobs
          (id, customer_name, project_name, status, total, data, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
          customer_name = excluded.customer_name,
          project_name = excluded.project_name,
          status = excluded.status,
          total = excluded.total,
          data = excluded.data,
          updated_at = excluded.updated_at`
        )
          .bind(id, customerName, projectName, status, total, data, updatedAt)
          .run();

        return json({
          ok: true,
          id,
          updated_at: updatedAt,
        });
      }

      if (path.startsWith("/api/jobs/") && method === "GET") {
        const id = decodeURIComponent(path.split("/").pop());

        const job = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?")
          .bind(id)
          .first();

        if (!job) {
          return json(
            {
              error: "Job not found",
            },
            404
          );
        }

        try {
          job.data = JSON.parse(job.data);
        } catch {}

        return json(job);
      }

      if (path.startsWith("/api/jobs/") && method === "DELETE") {
        const id = decodeURIComponent(path.split("/").pop());

        await env.DB.prepare("DELETE FROM time_entries WHERE job_id = ?")
          .bind(id)
          .run();

        await env.DB.prepare("DELETE FROM jobs WHERE id = ?").bind(id).run();

        return json({
          ok: true,
        });
      }

      if (path === "/api/customers" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM customers ORDER BY name COLLATE NOCASE"
        ).all();

        return json(result.results || []);
      }

      if (path === "/api/customers" && method === "POST") {
        const body = await request.json();

        const id = body.id || crypto.randomUUID();
        const name = body.name || "";
        const phone = body.phone || "";
        const email = body.email || "";
        const address = body.address || "";
        const notes = body.notes || "";
        const updatedAt = new Date().toISOString();

        await env.DB.prepare(
          `INSERT INTO customers
          (id, name, phone, email, address, notes, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          email = excluded.email,
          address = excluded.address,
          notes = excluded.notes,
          updated_at = excluded.updated_at`
        )
          .bind(id, name, phone, email, address, notes, updatedAt)
          .run();

        return json({
          ok: true,
          id,
          updated_at: updatedAt,
        });
      }

      if (path === "/api/time" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM time_entries ORDER BY updated_at DESC"
        ).all();

        return json(result.results || []);
      }

      if (path === "/api/time" && method === "POST") {
        const body = await request.json();

        const id = body.id || crypto.randomUUID();
        const jobId = body.job_id || "";
        const worker = body.worker || "";
        const workType = body.work_type || "";
        const startTime = body.start_time || "";
        const endTime = body.end_time || "";
        const hours = Number(body.hours || 0);
        const note = body.note || "";
        const updatedAt = new Date().toISOString();

        await env.DB.prepare(
          `INSERT INTO time_entries
          (id, job_id, worker, work_type, start_time, end_time, hours, note, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
          job_id = excluded.job_id,
          worker = excluded.worker,
          work_type = excluded.work_type,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          hours = excluded.hours,
          note = excluded.note,
          updated_at = excluded.updated_at`
        )
          .bind(
            id,
            jobId,
            worker,
            workType,
            startTime,
            endTime,
            hours,
            note,
            updatedAt
          )
          .run();

        return json({
          ok: true,
          id,
          updated_at: updatedAt,
        });
      }

      if (path === "/api/settings" && method === "GET") {
        const result = await env.DB.prepare(
          "SELECT * FROM settings ORDER BY key"
        ).all();

        const settings = {};

        for (const row of result.results || []) {
          try {
            settings[row.key] = JSON.parse(row.data);
          } catch {
            settings[row.key] = row.data;
          }
        }

        return json(settings);
      }

      if (path === "/api/settings" && method === "POST") {
        const body = await request.json();
        const key = body.key;
        const data = JSON.stringify(body.data);
        const updatedAt = new Date().toISOString();

        if (!key) {
          return json(
            {
              error: "Setting key required",
            },
            400
          );
        }

        await env.DB.prepare(
          `INSERT INTO settings
          (key, data, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
          data = excluded.data,
          updated_at = excluded.updated_at`
        )
          .bind(key, data, updatedAt)
          .run();

        return json({
          ok: true,
          key,
          updated_at: updatedAt,
        });
      }

      return json(
        {
          error: "Route not found",
          path,
        },
        404
      );
    } catch (error) {
      return json(
        {
          ok: false,
          error: error.message || String(error),
        },
        500
      );
    }
  },
};
