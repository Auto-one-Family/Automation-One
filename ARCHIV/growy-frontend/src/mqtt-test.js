import mqtt from 'mqtt'

const client = mqtt.connect('ws://localhost:9001/mqtt')

client.on('connect', () => {
  console.log('Connected to MQTT broker!')

  // Subscribe to test topic
  client.subscribe('test/topic', (err) => {
    if (!err) {
      // Publish a test message
      client.publish('test/topic', 'Hello MQTT!')
    }
  })
})

client.on('message', (topic, message) => {
  console.log(`Received message on ${topic}: ${message.toString()}`)
})

client.on('error', (error) => {
  console.error('MQTT Error:', error)
})

// Keep the script running
setTimeout(() => {
  client.end()
  console.log('Test complete')
}, 5000)
