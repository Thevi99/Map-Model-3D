from flask import Flask, jsonify, request, render_template
import requests

app = Flask(__name__)

# Function to get city buildings data
def get_city_data(city_name):
    overpass_url = "http://overpass-api.de/api/interpreter"
    query = f"""
    [out:json];
    area[name="{city_name}"]->.searchArea;
    (
        way["building"](area.searchArea);
    );
    (._;>;);
    out body;
    """
    response = requests.post(overpass_url, data=query)
    return response.json() if response.status_code == 200 else {"error": f"Failed to fetch data for {city_name}"}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/city', methods=['GET'])
def api_city():
    city_name = request.args.get('name', 'Bangkok')
    data = get_city_data(city_name)
    return jsonify(data)

if __name__ == '__main__':
    app.run(debug=True)
