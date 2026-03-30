#!/bin/bash
# Firebase App Hosting シークレット一括登録スクリプト
# 使い方: bash scripts/setup-firebase-secrets.sh
#
# 事前準備:
#   gcloud auth login
#   gcloud config set project aivtuber-kit

set -e

PROJECT_ID="aivtuber-kit"
BACKEND_ID="aivtuber-kit"

# .env ファイルのパス（スクリプトの親ディレクトリ）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

# シークレット登録関数
# 空値の場合はスキップ（--force フラグで空値も登録）
register_secret() {
  local name="$1"
  local value="$2"
  local force="${3:-false}"

  if [ -z "$value" ] && [ "$force" != "true" ]; then
    echo "  SKIP: $name (空値のためスキップ。値を設定する場合は .env を更新して再実行)"
    return 0
  fi

  echo "  設定: $name"

  # シークレットが存在しない場合は作成
  if ! gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    gcloud secrets create "$name" \
      --project="$PROJECT_ID" \
      --replication-policy="automatic" \
      --quiet
    echo "    → 新規作成"
  else
    echo "    → 既存シークレットにバージョン追加"
  fi

  # 値をシークレットバージョンとして追加
  printf '%s' "$value" | gcloud secrets versions add "$name" \
    --project="$PROJECT_ID" \
    --data-file=- \
    --quiet

  # Firebase App Hosting サービスアカウントにアクセス権付与
  firebase apphosting:secrets:grantaccess "$name" \
    --project="$PROJECT_ID" \
    --backend="$BACKEND_ID" \
    2>/dev/null || echo "    ※ grantaccess はコンソールから手動で設定してください"
}

# .env からキーと値を読み込む関数
get_env_value() {
  local key="$1"
  # コメント行・空行を除外し、KEY="VALUE" または KEY=VALUE 形式を取得
  grep "^${key}=" "$ENV_FILE" | head -1 | sed 's/^[^=]*=//; s/^"//; s/"$//'
}

echo "======================================"
echo "Firebase App Hosting シークレット登録"
echo "プロジェクト: $PROJECT_ID"
echo "バックエンド: $BACKEND_ID"
echo "======================================"
echo ""

# ===== カスタムAPI（必須：現在使用中）=====
echo "[カスタムAPI]"
CUSTOM_API_BODY=$(get_env_value "NEXT_PUBLIC_CUSTOM_API_BODY")
register_secret "NEXT_PUBLIC_CUSTOM_API_BODY" "$CUSTOM_API_BODY"
echo ""

# ===== OpenAI =====
echo "[OpenAI]"
OPENAI_API_KEY=$(get_env_value "OPENAI_API_KEY")
register_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"
OPENAI_TTS_KEY=$(get_env_value "OPENAI_TTS_KEY")
register_secret "OPENAI_TTS_KEY" "$OPENAI_TTS_KEY"
echo ""

# ===== Anthropic =====
echo "[Anthropic]"
ANTHROPIC_API_KEY=$(get_env_value "ANTHROPIC_API_KEY")
register_secret "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"
echo ""

# ===== Google =====
echo "[Google]"
GOOGLE_API_KEY=$(get_env_value "GOOGLE_API_KEY")
register_secret "GOOGLE_API_KEY" "$GOOGLE_API_KEY"
GOOGLE_TTS_KEY=$(get_env_value "GOOGLE_TTS_KEY")
register_secret "GOOGLE_TTS_KEY" "$GOOGLE_TTS_KEY"
echo ""

# ===== Azure =====
echo "[Azure]"
AZURE_API_KEY=$(get_env_value "AZURE_API_KEY")
register_secret "AZURE_API_KEY" "$AZURE_API_KEY"
AZURE_TTS_KEY=$(get_env_value "AZURE_TTS_KEY")
register_secret "AZURE_TTS_KEY" "$AZURE_TTS_KEY"
echo ""

# ===== その他AIプロバイダー =====
echo "[その他AIプロバイダー]"
for key in XAI_API_KEY GROQ_API_KEY COHERE_API_KEY MISTRALAI_API_KEY \
           PERPLEXITY_API_KEY FIREWORKS_API_KEY DEEPSEEK_API_KEY \
           OPENROUTER_API_KEY DIFY_API_KEY; do
  val=$(get_env_value "$key")
  register_secret "$key" "$val"
done
echo ""

# ===== 音声合成 =====
echo "[音声合成]"
for key in ELEVENLABS_API_KEY CARTESIA_API_KEY AIVIS_CLOUD_API_KEY; do
  val=$(get_env_value "$key")
  register_secret "$key" "$val"
done
echo ""

echo "======================================"
echo "完了！"
echo ""
echo "次のステップ:"
echo "1. apphosting.yaml のコメントアウトされたシークレット行を有効化"
echo "2. git push でデプロイ"
echo "======================================"
