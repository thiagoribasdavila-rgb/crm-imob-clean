export default function CRMStats({
data
}:any){


return (

<div className="
grid grid-cols-4 gap-5
">


<div className="bg-zinc-900 p-5 rounded-xl">

<p>Leads</p>

<h2 className="text-3xl">
{data.total}
</h2>

</div>


<div className="bg-zinc-900 p-5 rounded-xl">

<p>Quentes IA</p>

<h2 className="text-3xl">
{data.hot}
</h2>

</div>


<div className="bg-zinc-900 p-5 rounded-xl">

<p>VIP</p>

<h2 className="text-3xl">
{data.vip}
</h2>

</div>


<div className="bg-zinc-900 p-5 rounded-xl">

<p>Pipeline</p>

<h2 className="text-3xl">
R$ VGV
</h2>

</div>


</div>

)

}
