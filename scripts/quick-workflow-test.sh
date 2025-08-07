#!/bin/bash

# Quick Enhanced Workflow Test Script
# Tests all workflows and step types with enhanced-workflow.service.ts

echo "🧪 Enhanced Workflow Testing Suite"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the honeyjar-server directory"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run the comprehensive test script
echo "🚀 Running enhanced workflow tests..."
echo ""

# Method 1: Direct TypeScript execution (if tsx is available)
if command -v tsx &> /dev/null; then
    echo "Using tsx to run TypeScript directly..."
    tsx scripts/test-enhanced-workflows.ts
elif command -v ts-node &> /dev/null; then
    echo "Using ts-node to run TypeScript..."
    ts-node scripts/test-enhanced-workflows.ts
else
    echo "⚠️ tsx or ts-node not found. Compiling and running..."
    
    # Compile TypeScript
    npx tsc scripts/test-enhanced-workflows.ts --outDir dist/scripts --target ES2020 --module commonjs --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck
    
    # Run compiled JavaScript
    node dist/scripts/test-enhanced-workflows.js
fi

echo ""
echo "✅ Enhanced workflow testing complete!"
echo ""
echo "📋 To run individual workflow tests:"
echo "   npm run test -- --grep \"Enhanced Workflow\""
echo ""
echo "🔧 To run specific workflow type:"
echo "   tsx scripts/test-enhanced-workflows.ts --workflow=\"Blog Article\""
echo ""
echo "📊 View detailed test results in the console output above" 