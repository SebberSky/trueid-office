// Jenkinsfile — webhook / SCM trigger restarts the office host via pm2.
// Do NOT run `npm run dev` as a long-lived Jenkins stage (job would kill it on exit).
//
// Setup (once on agent3 Jenkins agent):
//   1. Node + npm installed
//   2. npm i -g pm2 && pm2 startup
//   3. Agent label below matches this machine (change if needed)
//   4. Job: Pipeline from SCM, or "Generic Webhook Trigger" → build this job

pipeline {
  agent { label 'agent3' }

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Restart office (pm2)') {
      steps {
        sh 'chmod +x scripts/jenkins-restart.sh'
        sh 'bash scripts/jenkins-restart.sh'
      }
    }
  }

  post {
    success {
      echo 'Office restarted. Guests: https://100.67.207.114:5173/'
    }
    failure {
      echo 'Restart failed — check Node/pm2 on the agent and port 5173/3001.'
    }
  }
}
