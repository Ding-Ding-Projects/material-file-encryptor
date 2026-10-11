using System.Text.Json;
using System.Text.Json.Nodes;

internal sealed class MediaCommand
{
    internal string Operation { get; }
    internal string[] Arguments { get; }
    private readonly string work;
    private readonly string? extension;

    private MediaCommand(string operation, string[] arguments, string directory, string? outputExtension)
    { Operation = operation; Arguments = arguments; work = directory; extension = outputExtension; }

    internal static MediaCommand Create(JsonElement media, string runtime, string work)
    {
        if (media.ValueKind != JsonValueKind.Object || media.EnumerateObject().Any(p => p.Name != "operation" && p.Name != "profile")) throw new ArgumentException("Only a fixed media operation and profile may be supplied.");
        string profile = "default";
        if (media.TryGetProperty("profile", out var profileValue))
        {
            if (profileValue.ValueKind != JsonValueKind.String) throw new ArgumentException("Media profile must be a supported name.");
            profile = profileValue.GetString()!;
        }
        if (profile is not ("default" or "minimal-v1")) throw new ArgumentException("Unsupported media profile.");
        var operation = media.GetProperty("operation").GetString();
        var probe = operation == "probe";
        var expected = probe ? "ffprobe.exe" : "ffmpeg.exe";
        if (!Path.GetFileName(runtime).Equals(expected, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("The staged media executable does not match the operation.");
        var input = Path.Combine(work, "input-0.bin");
        var output = Path.Combine(work, "result-0.bin");
        if (!File.Exists(input) || new FileInfo(input).Length is <= 0 or > 67108864) throw new ArgumentException("Media input must contain between 1 byte and 64 MiB.");
        if (File.Exists(output) || Directory.Exists(output)) throw new ArgumentException("Media output already exists.");
        if (probe)
            return new("probe", ["-v", "error", "-max_alloc", "67108864", "-protocol_whitelist", "file,pipe", "-show_entries", "format=format_name,duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,pix_fmt,sample_rate,channels,duration,nb_frames:stream_tags=rotate:stream_side_data=rotation", "-of", "json", "-i", input], work, null);
        var arguments = new List<string> { "-nostdin", "-hide_banner", "-loglevel", "error", "-xerror", "-max_alloc", "67108864", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-protocol_whitelist", "file,pipe", "-noautorotate", "-i", input };
        string? extension;
        switch (operation)
        {
            case "image-png": arguments.AddRange(["-map", "0:v:0", "-frames:v", "1", "-c:v", "png", "-f", "image2", "-update", "1"]); extension = "png"; break;
            case "image-jpeg": arguments.AddRange(["-map", "0:v:0", "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "2", "-f", "image2", "-update", "1"]); extension = "jpg"; break;
            case "audio-wav": arguments.AddRange(["-map", "0:a:0", "-vn", "-c:a", "pcm_s16le", "-f", "wav"]); extension = "wav"; break;
            case "audio-flac": arguments.AddRange(["-map", "0:a:0", "-vn", "-c:a", "flac", "-f", "flac"]); extension = "flac"; break;
            case "audio-mp3": arguments.AddRange(["-map", "0:a:0", "-vn", "-c:a", profile == "minimal-v1" ? "mp3_mf" : "libmp3lame", "-b:a", "192k", "-f", "mp3"]); extension = "mp3"; break;
            case "video-mp4":
                arguments.AddRange(["-map", "0:v:0", "-map", "0:a:0?"]);
                if (profile == "minimal-v1") arguments.AddRange(["-c:v", "mpeg4", "-q:v", "3"]);
                else arguments.AddRange(["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]);
                arguments.AddRange(["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-f", "mp4"]);
                extension = "mp4"; break;
            case "validate": arguments.AddRange(["-map", "0:v?", "-map", "0:a?", "-f", "null", "-"]); extension = null; break;
            default: throw new ArgumentException("Unsupported media operation.");
        }
        if (operation != "validate") arguments.AddRange(["-map_metadata", "-1", "-map_chapters", "-1", "-threads", "1", "-n", output]);
        return new(operation!, arguments.ToArray(), work, extension);
    }

    internal void WriteResult(string nonce)
    {
        object result;
        if (Operation == "probe")
        {
            var log = Path.Combine(work, "worker.log");
            if (new FileInfo(log).Length is <= 0 or > 1048576) throw new InvalidDataException("Probe output must be between 1 byte and 1 MiB.");
            var details = JsonNode.Parse(File.ReadAllBytes(log)) as JsonObject ?? throw new InvalidDataException("Probe output is not an object.");
            if (details["streams"] is not JsonArray streams || streams.Count == 0 || streams.Count > 32) throw new InvalidDataException("Probe stream count is outside the limit.");
            result = new { schema = 1, nonce, outputs = Array.Empty<object>(), details };
        }
        else if (Operation == "validate") result = new { schema = 1, nonce, outputs = Array.Empty<object>(), details = new { operation = Operation, decoded = true } };
        else
        {
            var output = Path.Combine(work, "result-0.bin");
            var info = new FileInfo(output);
            if (!info.Exists || info.Length is <= 0 or > 67108864 || info.Attributes.HasFlag(FileAttributes.ReparsePoint)) throw new InvalidDataException("Media result must contain between 1 byte and 64 MiB.");
            result = new { schema = 1, nonce, outputs = new[] { new { name = "converted." + extension, filename = "result-0.bin", bytes = info.Length } }, details = new { operation = Operation, outputBytes = info.Length, validationRequired = true } };
        }
        var bytes = JsonSerializer.SerializeToUtf8Bytes(result);
        if (bytes.Length > 1048576) throw new InvalidDataException("Media result metadata exceeds 1 MiB.");
        File.WriteAllBytes(Path.Combine(work, "result.json"), bytes);
    }

    internal bool LimitsExceeded()
    {
        var log = new FileInfo(Path.Combine(work, "worker.log"));
        var output = new FileInfo(Path.Combine(work, "result-0.bin"));
        return (log.Exists && log.Length > 1048576) || (output.Exists && output.Length > 67108864);
    }
}
